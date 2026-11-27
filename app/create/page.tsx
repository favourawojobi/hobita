"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider } from "@anchor-lang/core";
import { Shell } from "@/components/Shell";
import { createCircle, getProgram, USDC_MINT } from "@/lib/hobita";
import { readableError, usd } from "@/lib/format";
import { saveCircleName } from "@/lib/metadata";

const PERIODS = [
  { label: "30 seconds", hint: "demo speed", value: 30, grace: 5 },
  { label: "1 week", hint: "real circle", value: 604_800, grace: 3_600 },
  { label: "1 month", hint: "real circle", value: 2_592_000, grace: 86_400 },
];

export default function CreatePage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { connected } = useWallet();
  const router = useRouter();

  const [name, setName] = useState("");
  const [contribution, setContribution] = useState("20");
  const [members, setMembers] = useState(5);
  const [periodIndex, setPeriodIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contributionNumber = Math.max(Number(contribution) || 0, 0);
  const deposit = contributionNumber * Math.max(members - 1, 0);
  const pot = contributionNumber * members;
  const period = PERIODS[periodIndex];

  const canCreate =
    connected &&
    Boolean(wallet) &&
    Boolean(USDC_MINT) &&
    contributionNumber > 0 &&
    members >= 2 &&
    members <= 16 &&
    !busy;

  const summary = useMemo(
    () => [
      ["Pot per round", usd(pot)],
      ["Safety deposit", usd(deposit)],
      ["Payout fee", "1.5%"],
    ],
    [pot, deposit],
  );

  async function onCreate() {
    if (!wallet || !USDC_MINT) return;
    setBusy(true);
    setError(null);
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });
      const program = getProgram(provider);
      const { circle } = await createCircle(program, wallet, {
        mint: USDC_MINT,
        contribution: Math.round(contributionNumber * 1_000_000),
        members,
        periodSeconds: period.value,
        graceSeconds: period.grace,
        feeBps: 150,
      });
      if (name.trim()) saveCircleName(circle.toBase58(), name.trim());
      router.push(`/circle/${circle.toBase58()}`);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <section className="pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-moss">
          New circle
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">
          Set the rhythm.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          Everyone pays the same amount each round. One member takes the pot,
          then it rotates.
        </p>
      </section>

      {!connected && (
        <div className="card mt-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Connect a wallet first</p>
            <p className="mt-0.5 text-xs text-ink/55">
              Devnet only. No real money.
            </p>
          </div>
          <WalletMultiButton />
        </div>
      )}

      <section className="card mt-5 space-y-5">
        <div>
          <label className="label" htmlFor="circle-name">
            Circle name <span className="normal-case text-ink/35">(optional)</span>
          </label>
          <input
            id="circle-name"
            className="input"
            placeholder="Lagos market women"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="contribution">
            Contribution per round
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink/40">
              $
            </span>
            <input
              id="contribution"
              className="input pl-8"
              inputMode="decimal"
              value={contribution}
              onChange={(event) => setContribution(event.target.value)}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink/35">
              USDC
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="label mb-0">Members</span>
            <span className="text-xs font-semibold text-ink/45">
              {members} slots
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-forest/15 text-lg font-bold text-forest disabled:opacity-30"
              disabled={members <= 2}
              onClick={() => setMembers((value) => Math.max(2, value - 1))}
              aria-label="Remove a member"
            >
              −
            </button>
            <div className="flex-1 rounded-2xl bg-forest/5 py-2 text-center text-lg font-bold">
              {members}
            </div>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-forest/15 text-lg font-bold text-forest disabled:opacity-30"
              disabled={members >= 16}
              onClick={() => setMembers((value) => Math.min(16, value + 1))}
              aria-label="Add a member"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <span className="label">Round length</span>
          <div className="grid grid-cols-3 gap-2">
            {PERIODS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriodIndex(index)}
                className={`rounded-2xl border px-2 py-3 text-center transition ${
                  index === periodIndex
                    ? "border-forest bg-forest text-cream"
                    : "border-forest/15 bg-white text-ink hover:border-moss/40"
                }`}
              >
                <span className="block text-xs font-bold">{option.label}</span>
                <span
                  className={`mt-0.5 block text-[10px] ${
                    index === periodIndex ? "text-cream/55" : "text-ink/40"
                  }`}
                >
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card mt-3 bg-forest text-cream">
        <div className="grid grid-cols-3 gap-3">
          {summary.map(([label, value]) => (
            <div key={label}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream/45">
                {label}
              </div>
              <div className="mt-1 text-lg font-bold">{value}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-cream/10 pt-3 text-[11px] leading-relaxed text-cream/55">
          Each member locks the safety deposit when they join. It is refunded
          after the last payout, minus anything used to cover missed rounds.
        </p>
      </section>

      {error && (
        <p className="mt-3 rounded-2xl bg-coral/10 px-4 py-3 text-xs font-medium text-coral">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={!canCreate}
        onClick={onCreate}
      >
        {busy ? "Opening the circle…" : "Create circle"}
        {!busy && <span aria-hidden="true">→</span>}
      </button>

      {!USDC_MINT && (
        <p className="mt-3 text-center text-[11px] text-coral">
          Test USDC mint is not configured. Set NEXT_PUBLIC_USDC_MINT in
          .env.local.
        </p>
      )}

      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink/40">
        Creating a circle is a real devnet transaction. It costs a little devnet
        SOL for rent and fees.
      </p>
    </Shell>
  );
}
