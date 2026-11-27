import { NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

export const runtime = "nodejs";

const lastClaim = new Map<string, number>();
const COOLDOWN = 45_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      wallet?: string;
      wallets?: string[];
      amount?: number;
    };

    const requested = body.wallets ?? (body.wallet ? [body.wallet] : []);
    if (requested.length === 0 || requested.length > 6) {
      return NextResponse.json(
        { error: "provide 1–6 wallets" },
        { status: 400 },
      );
    }

    const amount = Math.min(Math.max(body.amount ?? 500, 1), 1_000);
    const mintAddress = process.env.NEXT_PUBLIC_USDC_MINT;
    const secret = process.env.SOLANA_FAUCET_SECRET;

    if (!mintAddress || !secret) {
      return NextResponse.json(
        { error: "Faucet is not configured on this deployment" },
        { status: 503 },
      );
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet"),
      "confirmed",
    );
    const payer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(secret) as number[]),
    );
    const mint = new PublicKey(mintAddress);

    const now = Date.now();
    const recipients: PublicKey[] = [];
    const skipped: string[] = [];

    for (const address of requested) {
      let key: PublicKey;
      try {
        key = new PublicKey(address);
      } catch {
        return NextResponse.json(
          { error: `invalid wallet: ${address}` },
          { status: 400 },
        );
      }
      if (now - (lastClaim.get(address) ?? 0) < COOLDOWN) {
        skipped.push(address);
        continue;
      }
      recipients.push(key);
    }

    const signatures: string[] = [];

    for (const recipient of recipients) {
      const balance = await connection.getBalance(recipient);
      if (balance < 0.01 * LAMPORTS_PER_SOL) {
        const transfer = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: recipient,
            lamports: Math.round(0.05 * LAMPORTS_PER_SOL),
          }),
        );
        signatures.push(await sendAndConfirmTransaction(connection, transfer, [payer]));
      }

      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        recipient,
      );
      signatures.push(
        await mintTo(
          connection,
          payer,
          mint,
          ata.address,
          payer,
          Math.round(amount * 1_000_000),
        ),
      );
      lastClaim.set(recipient.toBase58(), now);
    }

    return NextResponse.json({
      signatures,
      amount,
      funded: recipients.length,
      skipped,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Faucet failed" },
      { status: 500 },
    );
  }
}
