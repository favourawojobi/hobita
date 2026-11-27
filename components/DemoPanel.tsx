"use client";

import { useMemo, useState } from "react";
import { AnchorProvider } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  getDemoKeypairs,
  isDemoWallet,
} from "@/components/DemoWalletAdapter";
import {
  contribute,
  coverDefault,
  getProgram,
  joinCircle,
  type MemberWithKey,
} from "@/lib/hobita";
import { readableError } from "@/lib/format";

function programFor(connection: Connection, keypair: Keypair) {
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async <T,>(transaction: T) => {
      (transaction as { partialSign: (k: unknown) => void }).partialSign(keypair);
      return transaction;
    },
    signAllTransactions: async <T,>(transactions: T[]) => {
      for (const transaction of transactions) {
        (transaction as { partialSign: (k: unknown) => void }).partialSign(
          keypair,
        );
      }
      return transactions;
    },
  };
  return getProgram(
    new AnchorProvider(connection, wallet as never, {
      commitment: "confirmed",
    }),
  );
}

export function DemoPanel({
  circle,
  mint,
  members,
  currentRound,
  onRefresh,
}: {
  circle: PublicKey;
  mint: PublicKey;
  members: MemberWithKey[];
  currentRound: number;
  onRefresh: () => Promise<void>;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const keypairs = useMemo(() => getDemoKeypairs(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isDemoWallet(publicKey)) return null;

  const roundBit = currentRound > 0 ? 1 << (currentRound - 1) : 0;
  const joinedWallets = new Set(
    members.map((member) => member.account.wallet.toBase58()),
  );
  const missing = keypairs.filter(
    (keypair) => !joinedWallets.has(keypair.publicKey.toBase58()),
  );
  const unpaid = members.filter(
    (member) =>
      (member.account.paidRounds & roundBit) === 0 &&
      (member.account.coveredRounds & roundBit) === 0,
  );
  const demoUnpaid = unpaid.filter((member) =>
    keypairs.some((keypair) => keypair.publicKey.equals(member.account.wallet)),
  );

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setError(null);
    setLog(null);
    try {
      const message = await action();
      setLog(message);
      await onRefresh();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function fundAll() {
    await run("fund", async () => {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallets: keypairs.map((keypair) => keypair.publicKey.toBase58()),
          amount: 500,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Faucet failed");
      return "All 5 demo wallets funded with SOL + 500 test USDC.";
    });
  }

  async function joinAll() {
    await run("join", async () => {
      for (const keypair of missing) {
        const program = programFor(connection, keypair);
        await joinCircle(
          program,
          { publicKey: keypair.publicKey },
          circle,
          mint,
        );
      }
      return `Joined ${missing.length} demo member${missing.length === 1 ? "" : "s"}.`;
    });
  }

  async function payAll() {
    await run("pay", async () => {
      let count = 0;
      for (const member of demoUnpaid) {
        const keypair = keypairs.find((candidate) =>
          candidate.publicKey.equals(member.account.wallet),
        );
        if (!keypair) continue;
        const program = programFor(connection, keypair);
        await contribute(program, { publicKey: keypair.publicKey }, circle, mint);
        count += 1;
      }
      return `Paid round ${currentRound} for ${count} demo member${count === 1 ? "" : "s"}.`;
    });
  }

  async function coverAll() {
    await run("cover", async () => {
      const caller = keypairs[0];
      const program = programFor(connection, caller);
      let count = 0;
      for (const member of unpaid) {
        await coverDefault(program, { publicKey: caller.publicKey }, circle, member.publicKey);
        count += 1;
      }
      return `Covered ${count} missed payment${count === 1 ? "" : "s"} from deposits.`;
    });
  }

  return (
    <section className="card mt-5 border-dashed border-gold/60 bg-gold/5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-forest/70">
          Demo tools
        </h2>
        <span className="text-[10px] font-semibold text-ink/35">
          real devnet txs
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink/50">
        You are acting as a Hobita demo wallet. These buttons let one person
        play every member — each action is signed by that member&apos;s key and
        lands on devnet.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-ghost !min-h-[40px] !px-3 !text-[11px]"
          disabled={Boolean(busy)}
          onClick={fundAll}
        >
          {busy === "fund" ? "Funding…" : "1 · Fund all"}
        </button>
        <button
          type="button"
          className="btn-ghost !min-h-[40px] !px-3 !text-[11px]"
          disabled={Boolean(busy) || missing.length === 0}
          onClick={joinAll}
        >
          {busy === "join" ? "Joining…" : `2 · Join ${missing.length}`}
        </button>
        <button
          type="button"
          className="btn-ghost !min-h-[40px] !px-3 !text-[11px]"
          disabled={Boolean(busy) || currentRound < 1 || demoUnpaid.length === 0}
          onClick={payAll}
        >
          {busy === "pay" ? "Paying…" : `3 · Pay ${demoUnpaid.length}`}
        </button>
        <button
          type="button"
          className="btn-ghost !min-h-[40px] !px-3 !text-[11px]"
          disabled={Boolean(busy) || currentRound < 1 || unpaid.length === 0}
          onClick={coverAll}
        >
          {busy === "cover" ? "Covering…" : `4 · Cover ${unpaid.length}`}
        </button>
      </div>

      {log && (
        <p className="mt-2 rounded-xl bg-moss/10 px-3 py-2 text-[11px] font-medium text-moss">
          {log}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-xl bg-coral/10 px-3 py-2 text-[11px] font-medium text-coral">
          {error}
        </p>
      )}
    </section>
  );
}
