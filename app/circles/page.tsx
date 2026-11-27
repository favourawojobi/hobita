"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Shell } from "@/components/Shell";
import {
  fetchAllCircles,
  getReadOnlyProgram,
  statusOf,
  type CircleAccount,
} from "@/lib/hobita";
import { allCircleNames } from "@/lib/metadata";
import { shortKey, usd } from "@/lib/format";
import { fetchCircleNames } from "@/lib/activity";

type Loaded = { address: PublicKey; account: CircleAccount };

const FILTERS = ["All", "Open", "Active", "Mine"] as const;
type Filter = (typeof FILTERS)[number];

export default function CirclesPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const router = useRouter();
  const [circles, setCircles] = useState<Loaded[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const readProgram = useMemo(
    () => getReadOnlyProgram(connection),
    [connection],
  );

  const load = useCallback(async () => {
    try {
      const all = await fetchAllCircles(readProgram);
      const loaded: Loaded[] = all.map((item) => ({
        address: item.publicKey,
        account: item.account,
      }));
      setCircles(
        loaded.sort((a, b) => {
          const order = { open: 0, active: 1, completed: 2, cancelled: 3 };
          const aStatus = statusOf(a.account);
          const bStatus = statusOf(b.account);
          return (order[aStatus] ?? 9) - (order[bStatus] ?? 9);
        }),
      );
    } catch {
      setCircles([]);
    } finally {
      setLoading(false);
    }
  }, [readProgram]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setNames(allCircleNames());
    void fetchCircleNames().then((remote) => {
      setNames((previous) => ({ ...previous, ...remote }));
    });
  }, []);

  const visible = circles.filter((circle) => {
    const status = statusOf(circle.account);
    if (filter === "Open") return status === "open";
    if (filter === "Active") return status === "active";
    if (filter === "Mine")
      return Boolean(publicKey && circle.account.creator.equals(publicKey));
    return true;
  });

  function openInvite() {
    const value = invite.trim();
    if (!value) return;
    const address = value.includes("/join/")
      ? value.split("/join/")[1].split(/[?#]/)[0]
      : value;
    try {
      const key = new PublicKey(address);
      router.push(`/join/${key.toBase58()}`);
    } catch {
      setInviteError("That does not look like a circle invite link or address.");
    }
  }

  return (
    <Shell>
      <section className="pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-moss">
          Circles
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">
          Find your people.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          Join a circle that is still filling up, or check on one you are
          already in.
        </p>
      </section>

      <section className="card mt-5">
        <label className="label" htmlFor="invite">
          Have an invite?
        </label>
        <div className="flex gap-2">
          <input
            id="invite"
            className="input"
            placeholder="Paste an invite link or circle address"
            value={invite}
            onChange={(event) => {
              setInvite(event.target.value);
              setInviteError(null);
            }}
          />
          <button
            type="button"
            className="btn-primary !min-h-[48px] !px-5"
            onClick={openInvite}
          >
            Open
          </button>
        </div>
        {inviteError && (
          <p className="mt-2 text-[11px] font-medium text-coral">
            {inviteError}
          </p>
        )}
      </section>

      <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
              filter === option
                ? "bg-forest text-cream"
                : "bg-white/60 text-ink/50 ring-1 ring-forest/10 hover:text-ink"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <section className="mt-3 space-y-2.5">
        {loading && (
          <div className="card animate-pulse">
            <div className="h-4 w-28 rounded bg-forest/10" />
            <div className="mt-3 h-8 w-40 rounded bg-forest/10" />
            <div className="mt-4 h-3 w-full rounded bg-forest/5" />
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="card text-center">
            <p className="text-sm font-bold">No circles here yet</p>
            <p className="mt-1 text-xs leading-relaxed text-ink/50">
              {filter === "All"
                ? "Start the first one. It takes about a minute to set up."
                : "Try a different filter, or start your own circle."}
            </p>
            <Link href="/create" className="btn-primary mt-4">
              Start a circle
            </Link>
          </div>
        )}

        {visible.map(({ address, account }) => {
          const status = statusOf(account);
          const name = names[address.toBase58()] ?? "";
          const pot = account.contribution.muln(account.maxMembers);
          const isMine = Boolean(
            publicKey && account.creator.equals(publicKey),
          );
          return (
            <Link
              key={address.toBase58()}
              href={
                status === "open"
                  ? `/join/${address.toBase58()}`
                  : `/circle/${address.toBase58()}`
              }
              className="card block transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-bold">
                      {name || `Circle ${shortKey(address)}`}
                    </h2>
                    {isMine && (
                      <span className="pill bg-gold/20 text-forest">Yours</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink/40">
                    {account.memberCount}/{account.maxMembers} members ·{" "}
                    {usd(account.contribution)} each ·{" "}
                    {account.periodSeconds.toNumber() < 120
                      ? `${account.periodSeconds.toNumber()}s rounds`
                      : `${Math.round(account.periodSeconds.toNumber() / 86_400)}d rounds`}
                  </p>
                </div>
                <span
                  className={`pill shrink-0 ${
                    status === "open"
                      ? "bg-moss/10 text-moss"
                      : status === "active"
                        ? "bg-gold/20 text-forest"
                        : "bg-forest/5 text-ink/45"
                  }`}
                >
                  {status === "open"
                    ? "Open"
                    : status === "active"
                      ? `Round ${account.currentRound}`
                      : status}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between border-t border-forest/5 pt-3">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink/35">
                    Pot per round
                  </div>
                  <div className="text-xl font-bold tracking-tight">
                    {usd(pot)}
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-moss">
                  {status === "open" ? "View invite →" : "Open circle →"}
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-ink/35">
        Every circle shown is a live account on Solana devnet.
      </p>
    </Shell>
  );
}
