"use client";

import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "@/lib/idl/hobita.json";

export const PROGRAM_ID = new PublicKey(
  idl.address || process.env.NEXT_PUBLIC_PROGRAM_ID!,
);

export const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT
  ? new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT)
  : null;

export type CircleStatus = "open" | "active" | "completed" | "cancelled";

export type CircleAccount = {
  creator: PublicKey;
  circleId: BN;
  tokenMint: PublicKey;
  vault: PublicKey;
  feeAta: PublicKey;
  feeRecipient: PublicKey;
  contribution: BN;
  maxMembers: number;
  periodSeconds: BN;
  graceSeconds: BN;
  feeBps: number;
  status: Record<string, unknown>;
  currentRound: number;
  roundPaidCount: number;
  memberCount: number;
  startTs: BN;
  bump: number;
};

export type MemberAccount = {
  circle: PublicKey;
  wallet: PublicKey;
  slot: number;
  collateral: BN;
  collateralRemaining: BN;
  paidRounds: number;
  coveredRounds: number;
  hasReceivedPayout: boolean;
  bump: number;
};

export type MemberWithKey = {
  publicKey: PublicKey;
  account: MemberAccount;
};

export function getProgram(provider: AnchorProvider) {
  return new Program(idl as never, provider) as unknown as Program;
}

export function getReadOnlyProgram(connection: Connection) {
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async <T,>(transaction: T) => transaction,
    signAllTransactions: async <T,>(transactions: T[]) => transactions,
  };
  const provider = new AnchorProvider(connection, dummyWallet as never, {
    commitment: "confirmed",
  });
  return new Program(idl as never, provider) as unknown as Program;
}

export function statusOf(circle: Pick<CircleAccount, "status">): CircleStatus {
  const key = Object.keys(circle.status)[0];
  if (key === "open" || key === "active" || key === "completed" || key === "cancelled") {
    return key;
  }
  return "open";
}

export function circlePda(creator: PublicKey, circleId: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("circle"),
      creator.toBuffer(),
      circleId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID,
  )[0];
}

export function memberPda(circle: PublicKey, wallet: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), circle.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function vaultFor(mint: PublicKey, circle: PublicKey) {
  return getAssociatedTokenAddressSync(mint, circle, true);
}

export function tokenAccountFor(mint: PublicKey, wallet: PublicKey) {
  return getAssociatedTokenAddressSync(mint, wallet);
}

export async function fetchCircle(program: Program, address: PublicKey) {
  return (program.account as never as {
    circle: { fetch: (key: PublicKey) => Promise<CircleAccount> };
  }).circle.fetch(address);
}

export async function fetchMembers(program: Program, circle: PublicKey) {
  const all = await (program.account as never as {
    member: {
      all: (
        filters?: { memcmp: { offset: number; bytes: string } }[],
      ) => Promise<{ publicKey: PublicKey; account: MemberAccount }[]>;
    };
  }).member.all([
    { memcmp: { offset: 8, bytes: circle.toBase58() } },
  ]);
  return all.sort((a, b) => a.account.slot - b.account.slot) as MemberWithKey[];
}

export async function fetchAllCircles(program: Program) {
  return (program.account as never as {
    circle: {
      all: () => Promise<{ publicKey: PublicKey; account: CircleAccount }[]>;
    };
  }).circle.all();
}

type CreateArgs = {
  mint: PublicKey;
  contribution: number;
  members: number;
  periodSeconds: number;
  graceSeconds: number;
  feeBps: number;
};

export async function createCircle(
  program: Program,
  wallet: { publicKey: PublicKey },
  args: CreateArgs,
) {
  const circleId = new BN(Date.now());
  const circle = circlePda(wallet.publicKey, circleId);
  const vault = vaultFor(args.mint, circle);
  const feeAta = tokenAccountFor(args.mint, wallet.publicKey);

  const tx = await (program.methods as never as {
    createCircle: (
      circleId: BN,
      contribution: BN,
      members: number,
      period: BN,
      grace: BN,
      feeBps: number,
    ) => {
      accounts: (accounts: Record<string, unknown>) => {
        rpc: () => Promise<string>;
      };
    };
  })
    .createCircle(
      circleId,
      new BN(args.contribution),
      args.members,
      new BN(args.periodSeconds),
      new BN(args.graceSeconds),
      args.feeBps,
    )
    .accounts({
      creator: wallet.publicKey,
      circle,
      vault,
      feeAta,
      tokenMint: args.mint,
      feeRecipient: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { circle, circleId, tx };
}

export async function joinCircle(
  program: Program,
  wallet: { publicKey: PublicKey },
  circle: PublicKey,
  mint: PublicKey,
) {
  const memberAccount = memberPda(circle, wallet.publicKey);
  const memberAta = tokenAccountFor(mint, wallet.publicKey);
  const vault = vaultFor(mint, circle);

  return (program.methods as never as {
    joinCircle: () => {
      accounts: (accounts: Record<string, unknown>) => {
        rpc: () => Promise<string>;
      };
    };
  })
    .joinCircle()
    .accounts({
      member: wallet.publicKey,
      circle,
      memberAccount,
      memberAta,
      vault,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function startCircle(
  program: Program,
  wallet: { publicKey: PublicKey },
  circle: PublicKey,
) {
  return (program.methods as never as {
    startCircle: () => {
      accounts: (accounts: Record<string, unknown>) => {
        rpc: () => Promise<string>;
      };
    };
  })
    .startCircle()
    .accounts({ circle, creator: wallet.publicKey })
    .rpc();
}

export async function contribute(
  program: Program,
  wallet: { publicKey: PublicKey },
  circle: PublicKey,
  mint: PublicKey,
) {
  const memberAccount = memberPda(circle, wallet.publicKey);
  const memberAta = tokenAccountFor(mint, wallet.publicKey);
  const vault = vaultFor(mint, circle);

  return (program.methods as never as {
    contribute: () => {
      accounts: (accounts: Record<string, unknown>) => {
        rpc: () => Promise<string>;
      };
    };
  })
    .contribute()
    .accounts({
      member: wallet.publicKey,
      circle,
      memberAccount,
      memberAta,
      vault,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export async function coverDefault(
  program: Program,
  wallet: { publicKey: PublicKey },
  circle: PublicKey,
  memberAccount: PublicKey,
) {
  return (program.methods as never as {
    coverDefault: () => {
      accounts: (accounts: Record<string, unknown>) => {
        rpc: () => Promise<string>;
      };
    };
  })
    .coverDefault()
    .accounts({
      caller: wallet.publicKey,
      circle,
      memberAccount,
    })
    .rpc();
}

export async function claimPayout(
  program: Program,
  wallet: { publicKey: PublicKey },
  circle: PublicKey,
  mint: PublicKey,
  recipient: MemberAccount,
  feeAta: PublicKey,
) {
  const recipientPda = memberPda(circle, recipient.wallet);
  const recipientAta = tokenAccountFor(mint, recipient.wallet);
  const vault = vaultFor(mint, circle);

  return (program.methods as never as {
    claimPayout: () => {
      accounts: (accounts: Record<string, unknown>) => {
        rpc: () => Promise<string>;
      };
    };
  })
    .claimPayout()
    .accounts({
      caller: wallet.publicKey,
      circle,
      recipient: recipientPda,
      recipientWallet: recipient.wallet,
      recipientAta,
      vault,
      feeAta,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export async function cancelCircle(
  program: Program,
  wallet: { publicKey: PublicKey },
  circle: PublicKey,
) {
  return (program.methods as never as {
    cancelCircle: () => {
      accounts: (accounts: Record<string, unknown>) => {
        rpc: () => Promise<string>;
      };
    };
  })
    .cancelCircle()
    .accounts({ circle, creator: wallet.publicKey })
    .rpc();
}

export async function withdrawCollateral(
  program: Program,
  wallet: { publicKey: PublicKey },
  circle: PublicKey,
  mint: PublicKey,
) {
  const memberAccount = memberPda(circle, wallet.publicKey);
  const memberAta = tokenAccountFor(mint, wallet.publicKey);
  const vault = vaultFor(mint, circle);

  return (program.methods as never as {
    withdrawCollateral: () => {
      accounts: (accounts: Record<string, unknown>) => {
        rpc: () => Promise<string>;
      };
    };
  })
    .withdrawCollateral()
    .accounts({
      member: wallet.publicKey,
      circle,
      memberAccount,
      memberAta,
      vault,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}
