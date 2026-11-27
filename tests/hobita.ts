import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Hobita } from "../target/types/hobita";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";

const CONTRIBUTION = new anchor.BN(20_000_000); // 20 USDC, 6 decimals
const MEMBERS = 5;
const PERIOD = new anchor.BN(2);
const GRACE = new anchor.BN(1);
const FEE_BPS = 150; // 1.5%

describe("hobita", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Hobita as Program<Hobita>;
  const payer = provider.wallet.payer;

  const members = Array.from({ length: MEMBERS }, () => Keypair.generate());
  const feeRecipient = Keypair.generate();

  const circleId = new anchor.BN(1);
  let mint: PublicKey;
  let circlePda: PublicKey;
  let vault: PublicKey;
  let feeAta: PublicKey;
  const memberPdas: PublicKey[] = [];
  const memberAtas: PublicKey[] = [];

  const circleSeeds = () => [
    Buffer.from("circle"),
    provider.wallet.publicKey.toBuffer(),
    circleId.toArrayLike(Buffer, "le", 8),
  ];

  const memberSeeds = (wallet: PublicKey) => [
    Buffer.from("member"),
    circlePda.toBuffer(),
    wallet.toBuffer(),
  ];

  const join = async (i: number) => {
    await program.methods
      .joinCircle()
      .accounts({
        member: members[i].publicKey,
        circle: circlePda,
        memberAccount: memberPdas[i],
        memberAta: memberAtas[i],
        vault,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([members[i]])
      .rpc();
  };

  const contribute = async (i: number) => {
    await program.methods
      .contribute()
      .accounts({
        member: members[i].publicKey,
        circle: circlePda,
        memberAccount: memberPdas[i],
        memberAta: memberAtas[i],
        vault,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([members[i]])
      .rpc();
  };

  const claim = async (i: number) => {
    await program.methods
      .claimPayout()
      .accounts({
        caller: provider.wallet.publicKey,
        circle: circlePda,
        recipient: memberPdas[i],
        recipientWallet: members[i].publicKey,
        recipientAta: memberAtas[i],
        vault,
        feeAta,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  };

  before(async () => {
    for (const member of [...members, feeRecipient]) {
      const sig = await provider.connection.requestAirdrop(
        member.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    mint = await createMint(
      provider.connection,
      payer,
      provider.wallet.publicKey,
      null,
      6,
    );

    for (const member of members) {
      const ata = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        member.publicKey,
      );
      memberAtas.push(ata.address);
      await mintTo(
        provider.connection,
        payer,
        mint,
        ata.address,
        provider.wallet.publicKey,
        1_000_000_000, // 1,000 USDC
      );
    }

    const feeAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      feeRecipient.publicKey,
    );
    feeAta = feeAccount.address;

    [circlePda] = PublicKey.findProgramAddressSync(
      circleSeeds(),
      program.programId,
    );
    vault = getAssociatedTokenAddressSync(mint, circlePda, true);

    for (const member of members) {
      const [pda] = PublicKey.findProgramAddressSync(
        memberSeeds(member.publicKey),
        program.programId,
      );
      memberPdas.push(pda);
    }

    await program.methods
      .createCircle(circleId, CONTRIBUTION, MEMBERS, PERIOD, GRACE, FEE_BPS)
      .accounts({
        creator: provider.wallet.publicKey,
        circle: circlePda,
        vault,
        feeAta,
        tokenMint: mint,
        feeRecipient: feeRecipient.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("rejects starting before the circle is full", async () => {
    try {
      await program.methods
        .startCircle()
        .accounts({
          circle: circlePda,
          creator: provider.wallet.publicKey,
        })
        .rpc();
      assert.fail("start should have failed");
    } catch (error) {
      assert.include(error.toString(), "NotFull");
    }
  });

  it("joins five members with (n - 1) collateral", async () => {
    for (let i = 0; i < MEMBERS; i++) {
      await join(i);
    }

    const circle = await program.account.circle.fetch(circlePda);
    assert.equal(circle.memberCount, MEMBERS);

    for (const pda of memberPdas) {
      const member = await program.account.member.fetch(pda);
      assert.equal(member.collateral.toString(), "80000000"); // 80 USDC
      assert.equal(member.collateralRemaining.toString(), "80000000");
    }
  });

  it("starts and pays round 1", async () => {
    await program.methods
      .startCircle()
      .accounts({
        circle: circlePda,
        creator: provider.wallet.publicKey,
      })
      .rpc();

    for (let i = 0; i < MEMBERS; i++) {
      await contribute(i);
    }

    await claim(0);

    const circle = await program.account.circle.fetch(circlePda);
    assert.equal(circle.currentRound, 2);

    const member = await program.account.member.fetch(memberPdas[0]);
    assert.isTrue(member.hasReceivedPayout);
  });

  it("covers a default and still pays the round", async () => {
    // Member 1 (slot 2) skips round 2.
    for (const i of [0, 2, 3, 4]) {
      await contribute(i);
    }

    // Period + grace is 3 seconds.
    await new Promise((resolve) => setTimeout(resolve, 3500));

    await program.methods
      .coverDefault()
      .accounts({
        caller: provider.wallet.publicKey,
        circle: circlePda,
        memberAccount: memberPdas[1],
      })
      .rpc();

    // Member 1's payout round is covered, so the deposit is untouched and the
    // missing contribution is withheld from the payout instead.
    const covered = await program.account.member.fetch(memberPdas[1]);
    assert.equal(covered.collateralRemaining.toString(), "80000000");
    assert.equal(covered.coveredRounds, 0b10);

    await claim(1);

    const circle = await program.account.circle.fetch(circlePda);
    assert.equal(circle.currentRound, 3);

    // The payout round was covered, so one contribution was withheld from the
    // payout and stays in the vault to replace the missed contribution.
    const afterPayout = await program.account.member.fetch(memberPdas[1]);
    assert.equal(afterPayout.collateralRemaining.toString(), "80000000");
  });

  it("rejects a second contribution in the same round", async () => {
    await contribute(2);
    try {
      await contribute(2);
      assert.fail("double contribution should have failed");
    } catch (error) {
      assert.include(error.toString(), "AlreadyPaid");
    }
  });

  it("completes the remaining rounds", async () => {
    // Round 3: member 3 (slot 4) misses it, so the deposit pays instead.
    for (const i of [0, 1, 4]) {
      await contribute(i);
    }
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await program.methods
      .coverDefault()
      .accounts({
        caller: provider.wallet.publicKey,
        circle: circlePda,
        memberAccount: memberPdas[3],
      })
      .rpc();

    const covered = await program.account.member.fetch(memberPdas[3]);
    assert.equal(covered.collateralRemaining.toString(), "60000000");

    await claim(2);

    // Round 4
    for (let i = 0; i < MEMBERS; i++) {
      await contribute(i);
    }
    await claim(3);

    // Round 5
    for (let i = 0; i < MEMBERS; i++) {
      await contribute(i);
    }
    await claim(4);

    const circle = await program.account.circle.fetch(circlePda);
    assert.equal(circle.status, 2); // Completed
  });

  it("returns remaining collateral and leaves the vault empty", async () => {
    for (let i = 0; i < MEMBERS; i++) {
      await program.methods
        .withdrawCollateral()
        .accounts({
          member: members[i].publicKey,
          circle: circlePda,
          memberAccount: memberPdas[i],
          memberAta: memberAtas[i],
          vault,
          tokenMint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([members[i]])
        .rpc();
    }

    const vaultAccount = await getAccount(provider.connection, vault);
    assert.equal(vaultAccount.amount.toString(), "0");

    const feeAccount = await getAccount(provider.connection, feeAta);
    assert.equal(feeAccount.amount.toString(), "7500000"); // 1.5% of 5 x 100 = 7.5 USDC
  });
});
