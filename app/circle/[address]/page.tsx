"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Shell } from "@/components/Shell";
import { CopyButton } from "@/components/CopyButton";
import { FaucetButton } from "@/components/FaucetButton";
import { DemoPanel } from "@/components/DemoPanel";
import { PayoutVoice } from "@/components/PayoutVoice";
import {
  cancelCircle,
  claimPayout,
  contribute,
  coverDefault,
  fetchCircle,
  fetchMembers,
  getReadOnlyProgram,
  joinCircle,
  startCircle,
  statusOf,
  tokenAccountFor,
  withdrawCollateral,
  type CircleAccount,
  type MemberWithKey,
} from "@/lib/hobita";
import { useProgram } from "@/lib/useProgram";
import { getCircleName, saveCircleName } from "@/lib/metadata";
import {
  fetchActivity,
  fetchCircleName,
  subscribeActivity,
  syncCircle,
  type ActivityRow,
} from "@/lib/activity";
import {
  explorerTx,
  readableError,
  shortKey,
  usd,
} from "@/lib/format";

function formatCountdown(seconds: number) {
  const clamped = Math.max(seconds, 0);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CirclePage() {
  const params = useParams<{ address: string }>();
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const program = useProgram();

  const [circle, setCircle] = useState<CircleAccount | null>(null);
  const [members, setMembers] = useState<MemberWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const lastSyncRef = useRef(0);
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );

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
      setCircle(null);
      setError("We could not find this circle on devnet.");
    } finally {
      setLoading(false);
    }
  }, [circleKey, readProgram]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!circle || statusOf(circle) !== "active") return;
    const id = window.setInterval(() => {
      void load();
    }, 12_000);
    return () => window.clearInterval(id);
  }, [circle, load]);

  useEffect(() => {
    if (!circleKey) return;
    const address = circleKey.toBase58();
    const local = getCircleName(address);
    if (local) setName(local);
    void fetchCircleName(address).then((remote) => {
      if (!remote) return;
      setName((current) => current || remote);
      saveCircleName(address, remote);
    });
  }, [circleKey]);

  useEffect(() => {
    if (!circle || !circleKey) return;
    const moment = Date.now();
    if (moment - lastSyncRef.current < 5_000) return;
    lastSyncRef.current = moment;
    void syncCircle(circleKey.toBase58(), circle, members, name);
  }, [circle, members, circleKey, name]);

  useEffect(() => {
    if (!circleKey) return;
    const address = circleKey.toBase58();
    let active = true;
    void fetchActivity(address).then((rows) => {
      if (active) setActivity(rows);
    });
    const unsubscribe = subscribeActivity(address, (row) => {
      setActivity((previous) =>
        previous.some((item) => item.id === row.id)
          ? previous
          : [row, ...previous].slice(0, 24),
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [circleKey]);

  const me = useMemo(
    () =>
      publicKey
        ? members.find((member) => member.account.wallet.equals(publicKey))
        : undefined,
    [members, publicKey],
  );

  const isCreator = Boolean(
    publicKey && circle && circle.creator.equals(publicKey),
  );

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setError(null);
    setSignature(null);
    try {
      if (!program) throw new Error("Connect a wallet first.");
      const tx = await action();
      setSignature(tx);
      await load();
      return tx;
    } catch (caught) {
      setError(readableError(caught));
      return null;
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="card mt-8 animate-pulse">
          <div className="h-5 w-24 rounded bg-forest/10" />
          <div className="mt-3 h-10 w-52 rounded bg-forest/10" />
          <div className="mt-6 h-28 rounded-2xl bg-forest/5" />
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
  const depositPerMember = circle.contribution.muln(
    Math.max(circle.maxMembers - 1, 0),
  );
  const pot = circle.contribution.muln(circle.maxMembers);
  const payout = pot.sub(pot.muln(circle.feeBps).divn(10_000));
  const round = circle.currentRound;
  const roundBit = round > 0 ? 1 << (round - 1) : 0;
  const paidThisRound = members.filter((member) => {
    return (
      (member.account.paidRounds & roundBit) !== 0 ||
      (member.account.coveredRounds & roundBit) !== 0
    );
  }).length;
  const deadline = circle.startTs.toNumber() + round * circle.periodSeconds.toNumber();
  const graceEnd = deadline + circle.graceSeconds.toNumber();
  const secondsToDeadline = deadline - now;
  const gracePassed = now > graceEnd;
  const roundComplete = paidThisRound >= circle.memberCount && circle.memberCount > 0;
  const nextMember = members.find(
    (member) => member.account.slot === round,
  );
  const nextWithheld =
    nextMember && (nextMember.account.coveredRounds & roundBit) !== 0
      ? circle.contribution
      : null;
  const payoutToNext = nextWithheld ? payout.sub(nextWithheld) : payout;
  const myBit = round > 0 ? 1 << (round - 1) : 0;
  const iPaid =
    me &&
    ((me.account.paidRounds & myBit) !== 0 ||
      (me.account.coveredRounds & myBit) !== 0);
  const unresolved = members.filter((member) => {
    return (
      (member.account.paidRounds & roundBit) === 0 &&
      (member.account.coveredRounds & roundBit) === 0
    );
  });

  const statusLabel: Record<string, string> = {
    open: "Filling slots",
    active: `Round ${round} of ${circle.maxMembers}`,
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return (
    <Shell>
      <section className="pt-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`pill ${
              status === "active"
                ? "bg-gold/20 text-forest"
                : status === "open"
                  ? "bg-moss/10 text-moss"
                  : "bg-forest/5 text-ink/50"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "active" ? "bg-gold" : "bg-moss"
              }`}
            />
            {statusLabel[status]}
          </span>
          {circleKey && (
            <CopyButton
              value={`${origin}/join/${circleKey.toBase58()}`}
              label="Copy invite link"
            />
          )}
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">
          {name || "Savings circle"}
        </h1>
        <p className="mt-1 text-sm text-ink/55">
          {usd(circle.contribution)} USDC · {circle.maxMembers} members ·{" "}
          {usd(depositPerMember)} deposit each
        </p>
      </section>

      <section className="card mt-5 bg-forest text-cream">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cream/45">
              {status === "active" ? "This round's pot" : "Pot per round"}
            </div>
            <div className="mt-1 text-4xl font-bold tracking-tight">
              {usd(pot)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cream/45">
              {status === "active" ? "Next payout" : "Paid each round"}
            </div>
            <div className="mt-1 text-sm font-bold">
              {status === "active"
                ? nextMember
                  ? shortKey(nextMember.account.wallet)
                  : "—"
                : "One member"}
            </div>
          </div>
        </div>

        {status === "active" && (
          <>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-cream/10">
              <div
                className="h-full rounded-full bg-gold transition-all"
                style={{
                  width: `${(paidThisRound / Math.max(circle.memberCount, 1)) * 100}%`,
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-cream/55">
              <span>
                {paidThisRound} of {circle.memberCount} paid
              </span>
              <span>
                {secondsToDeadline > 0
                  ? `due in ${formatCountdown(secondsToDeadline)}`
                  : gracePassed
                    ? "grace passed"
                    : `grace ${formatCountdown(graceEnd - now)}`}
              </span>
            </div>
          </>
        )}

        {status === "open" && (
          <p className="mt-4 border-t border-cream/10 pt-3 text-[12px] leading-relaxed text-cream/60">
            {circle.memberCount} of {circle.maxMembers} slots taken. The circle
            starts when it is full; deposits are refundable until then.
          </p>
        )}
      </section>

      {status === "open" && (
        <section className="mt-3 space-y-2">
          {!connected ? (
            <div className="card flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Connect to take a slot</p>
              <WalletMultiButton />
            </div>
          ) : me ? (
            <div className="card-flat flex items-center justify-between">
              <p className="text-xs font-bold text-moss">
                You are in — slot {me.account.slot}
              </p>
              <span className="text-[11px] text-ink/45">
                {usd(me.account.collateral)} locked
              </span>
            </div>
          ) : (
            <div className="card">
              <p className="text-sm font-bold">Take the next slot</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink/55">
                Lock {usd(depositPerMember)} of test USDC as a refundable
                deposit. It covers any round you miss and comes back at the end.
              </p>
              <button
                type="button"
                className="btn-primary mt-3 w-full"
                disabled={Boolean(busy)}
                onClick={() =>
                  run("join", () =>
                    joinCircle(program!, { publicKey: publicKey! }, circleKey, circle.tokenMint),
                  )
                }
              >
                {busy === "join"
                  ? "Locking deposit…"
                  : `Join and lock ${usd(depositPerMember)}`}
              </button>
              <div className="mt-2">
                <FaucetButton amount={500} />
              </div>
            </div>
          )}

          {isCreator && (
            <button
              type="button"
              className="btn-gold w-full"
              disabled={circle.memberCount !== circle.maxMembers || Boolean(busy)}
              onClick={() =>
                run("start", () => startCircle(program!, { publicKey: publicKey! }, circleKey))
              }
            >
              {busy === "start"
                ? "Starting…"
                : circle.memberCount === circle.maxMembers
                  ? "Start the circle"
                  : `Waiting for ${circle.maxMembers - circle.memberCount} more member${circle.maxMembers - circle.memberCount === 1 ? "" : "s"}`}
            </button>
          )}
        </section>
      )}

      {status === "active" && (
        <section className="mt-3 space-y-2">
          {!connected ? (
            <div className="card flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Connect to pay this round</p>
              <WalletMultiButton />
            </div>
          ) : me && !iPaid ? (
            <button
              type="button"
              className="btn-primary w-full"
              disabled={Boolean(busy)}
              onClick={() =>
                run("contribute", () =>
                  contribute(program!, { publicKey: publicKey! }, circleKey, circle.tokenMint),
                )
              }
            >
              {busy === "contribute"
                ? "Paying…"
                : `Pay ${usd(circle.contribution)} for round ${round}`}
            </button>
          ) : me && iPaid ? (
            <div className="card-flat text-center text-xs font-semibold text-moss">
              You have paid round {round}
            </div>
          ) : (
            <div className="card-flat text-center text-xs text-ink/50">
              You are not a member of this circle.
            </div>
          )}

          {roundComplete ? (
            <>
              <button
                type="button"
                className="btn-gold w-full"
                disabled={Boolean(busy) || !nextMember}
                onClick={() =>
                  run("payout", () =>
                    claimPayout(
                      program!,
                      { publicKey: publicKey! },
                      circleKey,
                      circle.tokenMint,
                      nextMember!.account,
                      circle.feeAta,
                    ),
                  )
                }
              >
                {busy === "payout"
                  ? "Paying out…"
                  : `Pay out ${usd(payoutToNext)} to ${shortKey(
                      nextMember?.account.wallet ?? circle.creator,
                    )}`}
              </button>
              {nextWithheld && (
                <p className="text-center text-[10px] leading-relaxed text-ink/40">
                  {usd(nextWithheld)} is withheld because this member&apos;s
                  payout round was covered. It stays in the vault to replace
                  the contribution they missed.
                </p>
              )}
            </>
          ) : gracePassed ? (
            <div className="card space-y-2">
              <p className="text-xs font-bold">
                {unresolved.length} missed payment
                {unresolved.length === 1 ? "" : "s"} — cover from deposit
              </p>
              <p className="text-[11px] leading-relaxed text-ink/50">
                Anyone can keep the circle on schedule. The amount comes out of
                the member&apos;s safety deposit, not yours.
              </p>
              {unresolved.map((member) => (
                <button
                  key={member.publicKey.toBase58()}
                  type="button"
                  className="btn-ghost w-full"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    run(`cover-${member.account.slot}`, () =>
                      coverDefault(
                        program!,
                        { publicKey: publicKey! },
                        circleKey,
                        member.publicKey,
                      ),
                    )
                  }
                >
                  {busy === `cover-${member.account.slot}`
                    ? "Covering…"
                    : `Cover slot ${member.account.slot} (${shortKey(member.account.wallet)})`}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-[11px] text-ink/40">
              The payout unlocks when everyone has paid, or after the grace
              period.
            </p>
          )}

          <PayoutVoice
            wallet={publicKey?.toBase58() ?? ""}
            round={round}
            mySlot={me?.account.slot ?? null}
            memberCount={circle.memberCount}
            periodSeconds={circle.periodSeconds.toNumber()}
            deadline={deadline}
            amount={usd(payout)}
            contribution={usd(circle.contribution)}
          />
        </section>
      )}

      {status === "completed" && (
        <section className="card mt-3 bg-gold/15">
          <p className="text-sm font-bold">The circle is complete.</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink/60">
            Every member has had a turn. Withdraw your remaining safety deposit.
          </p>
          {me && me.account.collateralRemaining.gtn(0) ? (
            <button
              type="button"
              className="btn-primary mt-3 w-full"
              disabled={Boolean(busy)}
              onClick={() =>
                run("withdraw", () =>
                  withdrawCollateral(
                    program!,
                    { publicKey: publicKey! },
                    circleKey,
                    circle.tokenMint,
                  ),
                )
              }
            >
              {busy === "withdraw"
                ? "Withdrawing…"
                : `Withdraw ${usd(me.account.collateralRemaining)} deposit`}
            </button>
          ) : me ? (
            <p className="mt-3 text-center text-[11px] font-semibold text-moss">
              Deposit already returned
            </p>
          ) : null}
        </section>
      )}

      {status === "cancelled" && me && me.account.collateralRemaining.gtn(0) && (
        <button
          type="button"
          className="btn-primary mt-3 w-full"
          disabled={Boolean(busy)}
          onClick={() =>
            run("withdraw", () =>
              withdrawCollateral(
                program!,
                { publicKey: publicKey! },
                circleKey,
                circle.tokenMint,
              ),
            )
          }
        >
          Withdraw {usd(me.account.collateralRemaining)} deposit
        </button>
      )}

      {error && (
        <p className="mt-3 rounded-2xl bg-coral/10 px-4 py-3 text-xs font-medium text-coral">
          {error}
        </p>
      )}

      {signature && (
        <a
          href={explorerTx(signature)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block text-center text-[11px] font-semibold text-moss underline"
        >
          Confirmed on devnet — view transaction
        </a>
      )}

      {(status === "active" || status === "open") && (
        <DemoPanel
          circle={circleKey}
          mint={circle.tokenMint}
          members={members}
          currentRound={round}
          onRefresh={load}
        />
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Members</h2>
          <span className="text-[11px] font-semibold text-ink/40">
            {circle.memberCount}/{circle.maxMembers}
          </span>
        </div>
        <div className="mt-2 space-y-2">
          {Array.from({ length: circle.maxMembers }).map((_, index) => {
            const member = members.find((m) => m.account.slot === index + 1);
            const isMe = Boolean(
              member && publicKey && member.account.wallet.equals(publicKey),
            );
            const paid = member && (member.account.paidRounds & roundBit) !== 0;
            const covered =
              member && (member.account.coveredRounds & roundBit) !== 0;
            const isNext = status === "active" && member?.account.slot === round;
            return (
              <div
                key={index}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                  isNext
                    ? "border-gold bg-gold/10"
                    : member
                      ? "border-forest/10 bg-white/70"
                      : "border-dashed border-forest/15"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${
                      member ? "bg-forest text-cream" : "bg-forest/5 text-ink/30"
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
                      {!member
                        ? "Waiting for a member"
                        : status === "open"
                          ? `${usd(member.account.collateral)} deposit locked`
                          : paid
                            ? "Paid this round"
                            : covered
                              ? "Covered from deposit"
                              : round > member.account.slot
                                ? "Already had their turn"
                                : "Owes this round"}
                    </p>
                  </div>
                </div>
                {isNext ? (
                  <span className="pill bg-gold text-forest">Up next</span>
                ) : paid ? (
                  <span className="pill bg-moss/10 text-moss">Paid</span>
                ) : covered ? (
                  <span className="pill bg-coral/10 text-coral">Covered</span>
                ) : member ? (
                  <span className="pill bg-forest/5 text-ink/40">
                    {usd(member.account.collateralRemaining)} left
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {activity.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Circle activity</h2>
            <span className="pill bg-moss/10 text-moss">Supabase · live</span>
          </div>
          <ol className="mt-2 space-y-2">
            {activity.map((row) => (
              <li key={row.id} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-moss/50" />
                <div>
                  <p className="text-[12px] leading-snug text-ink/70">
                    {row.message}
                  </p>
                  <p className="text-[10px] text-ink/35">
                    {new Date(row.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-5 space-y-2 text-[11px] leading-relaxed text-ink/40">
        <p>
          Circle address{" "}
          <span className="mono text-ink/60">{shortKey(circleKey)}</span> ·
          vault{" "}
          <a
            href={`https://explorer.solana.com/address/${circle.vault.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {shortKey(circle.vault)}
          </a>
        </p>
        <p>
          Contract holds every deposit and contribution. Hobita never takes
          custody. Test USDC on devnet only.
        </p>
        {isCreator && status === "open" && (
          <button
            type="button"
            className="text-[11px] font-semibold text-coral underline"
            disabled={Boolean(busy)}
            onClick={async () => {
              if (!program || !publicKey) return;
              setBusy("cancel");
              setError(null);
              try {
                const tx = await cancelCircle(program, { publicKey }, circleKey);
                setSignature(tx);
                await load();
              } catch (caught) {
                setError(readableError(caught));
              } finally {
                setBusy(null);
              }
            }}
          >
            Cancel this circle
          </button>
        )}
      </section>
    </Shell>
  );
}
