"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Shell } from "@/components/Shell";
import { CopyButton } from "@/components/CopyButton";
import { FaucetButton } from "@/components/FaucetButton";
import {
  fetchCircle,
  fetchMembers,
  getReadOnlyProgram,
  joinCircle,
  statusOf,
  USDC_MINT,
  type CircleAccount,
  type MemberWithKey,
} from "@/lib/hobita";
import { useProgram } from "@/lib/useProgram";
import { getCircleName } from "@/lib/metadata";
import { readableError, shortKey, usd, usdc } from "@/lib/format";

export default function JoinPage() {
  const params = useParams<{ address: string }>();
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const program = useProgram();

  const [circle, setCircle] = useState<CircleAccount | null>(null);
  const [members, setMembers] = useState<MemberWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const circleKey = useMemo(() => {
    try {
      return new PublicKey(params.address);
    } catch {
      return null;
    }
  }, [params.address]);

  const readProgram = useMemo(
    () => getReadOnlyProgram(connection),
    [connection],
  );

  const load = useCallback(async () => {
    if (!circleKey) return;
    try {
      const [nextCircle, nextMembers] = await Promise.all([
        fetchCircle(readProgram, circleKey),
        fetchMembers(readProgram, circleKey),
      ]);
      setCircle(nextCircle);
      setMembers(nextMembers);
      setError(null);
    } catch {
      setError("We could not find this circle on devnet.");
    } finally {
      setLoading(false);
    }
  }, [circleKey, readProgram]);

  useEffect(() => {
    void load();
  }, [load]);

  const isMember = Boolean(
    publicKey &&
      members.some((member) => member.account.wallet.equals(publicKey)),
  );

  async function onJoin() {
    if (!program || !publicKey || !circleKey || !circle) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await joinCircle(
        program,
        { publicKey },
        circleKey,
        circle.tokenMint,
      );
      setSignature(tx);
      await load();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="card mt-8 animate-pulse">
          <div className="h-5 w-32 rounded bg-forest/10" />
          <div className="mt-3 h-9 w-48 rounded bg-forest/10" />
          <div className="mt-6 h-24 rounded-2xl bg-forest/5" />
        </div>
      </Shell>
    );
  }

  if (!circle || !circleKey) {
    return (
      <Shell>
        <div className="card mt-8 text-center">
          <p className="text-sm font-bold">Circle not found</p>
          <p className="mt-1 text-xs text-ink/55">{error}</p>
          <Link href="/circles" className="btn-ghost mt-4">
            Browse circles
          </Link>
        </div>
      </Shell>
    );
  }

  const status = statusOf(circle);
  const deposit = circle.contribution.muln(Math.max(circle.maxMembers - 1, 0));
  const name = getCircleName(circleKey.toBase58());

  return (
    <Shell>
      <section className="pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="pill bg-forest/5 text-forest ring-1 ring-forest/10">
            {status === "open" ? "Open" : status}
          </span>
          <span className="text-[11px] font-semibold text-ink/40">
            {circle.memberCount} of {circle.maxMembers} joined
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">
          {name || "Savings circle"}
        </h1>
        <p className="mt-1 text-sm text-ink/55">
          You are invited to take a slot. The payout rotates one member per
          round.
        </p>
      </section>

      <section className="card mt-5 bg-forest text-cream">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cream/45">
          Pot per round
        </div>
        <div className="mt-1 text-4xl font-bold tracking-tight">
          {usd(circle.contribution.mul(circle.maxMembers))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-cream/10 pt-4">
          <div>
            <div className="text-[10px] text-cream/45">Contribution</div>
            <div className="mt-0.5 text-sm font-bold">
              {usd(circle.contribution)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-cream/45">Safety deposit</div>
            <div className="mt-0.5 text-sm font-bold">{usd(deposit)}</div>
          </div>
          <div>
            <div className="text-[10px] text-cream/45">Members</div>
            <div className="mt-0.5 text-sm font-bold">{circle.maxMembers}</div>
          </div>
        </div>
      </section>

      <section className="card mt-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/40">
              Your slot
            </p>
            <p className="mt-1 text-sm font-bold">
              {isMember
                ? `Slot ${members.find((m) => m.account.wallet.equals(publicKey!))?.account.slot}`
                : "Not joined yet"}
            </p>
          </div>
          <CopyButton value={circleKey.toBase58()} label="Copy invite" />
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-ink/55">
          Joining moves {usd(deposit)} of test USDC into the circle vault as
          your refundable safety deposit. It comes back when the circle ends,
          minus anything used to cover a missed round.
        </p>

        {!connected ? (
          <div className="mt-4">
            <WalletMultiButton />
          </div>
        ) : status !== "open" ? (
          <Link href={`/circle/${circleKey.toBase58()}`} className="btn-primary mt-4 w-full">
            Open the circle
          </Link>
        ) : isMember ? (
          <Link href={`/circle/${circleKey.toBase58()}`} className="btn-primary mt-4 w-full">
            You are in — open the circle
          </Link>
        ) : circle.memberCount >= circle.maxMembers ? (
          <p className="mt-4 rounded-2xl bg-gold/15 px-4 py-3 text-xs font-semibold text-forest">
            This circle is full. Ask the creator to start it.
          </p>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              disabled={busy || !USDC_MINT}
              onClick={onJoin}
            >
              {busy ? "Locking your deposit…" : `Join and lock ${usd(deposit)}`}
            </button>
            <div className="mt-2">
              <FaucetButton amount={500} />
            </div>
          </>
        )}

        {error && (
          <p className="mt-3 rounded-2xl bg-coral/10 px-4 py-3 text-xs font-medium text-coral">
            {error}
          </p>
        )}

        {signature && (
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block text-center text-[11px] font-semibold text-moss underline"
          >
            Joined — view transaction
          </a>
        )}
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-bold">Who is in</h2>
        <div className="mt-2 space-y-2">
          {Array.from({ length: circle.maxMembers }).map((_, index) => {
            const member = members.find((m) => m.account.slot === index + 1);
            const isMe = member && publicKey && member.account.wallet.equals(publicKey);
            return (
              <div
                key={index}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                  member
                    ? "border-forest/10 bg-white/70"
                    : "border-dashed border-forest/15 bg-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ${
                      member
                        ? "bg-forest text-cream"
                        : "bg-forest/5 text-ink/30"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-bold">
                      {member
                        ? isMe
                          ? "You"
                          : shortKey(member.account.wallet)
                        : "Open slot"}
                    </p>
                    <p className="text-[10px] text-ink/40">
                      {member ? "Safety deposit locked" : "Waiting for a member"}
                    </p>
                  </div>
                </div>
                {member && (
                  <span className="pill bg-moss/10 text-moss">Joined</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-ink/35">
        {usdc(circle.contribution)} USDC per round · {circle.maxMembers} rounds
        · 1.5% payout fee
      </p>
    </Shell>
  );
}
