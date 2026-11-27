import Link from "next/link";
import { Shell } from "@/components/Shell";

const members = [
  { initial: "A", name: "Amara", color: "bg-forest text-cream" },
  { initial: "T", name: "Tunde", color: "bg-gold text-forest" },
  { initial: "M", name: "Maya", color: "bg-moss text-cream" },
  { initial: "J", name: "Jide", color: "bg-coral text-white" },
  { initial: "S", name: "Sofia", color: "bg-sage text-forest" },
];

const steps = [
  {
    n: "01",
    title: "Open a circle",
    body: "Pick the contribution, the number of members and the rhythm. Share one invite link.",
  },
  {
    n: "02",
    title: "Everyone locks a safety deposit",
    body: "Each member deposits contribution × (members − 1). It is refundable, and it covers any missed round.",
  },
  {
    n: "03",
    title: "One payout per round",
    body: "The contract holds the pot and pays the next member. Anyone can trigger the payout; no one can run off with it.",
  },
];

export default function HomePage() {
  return (
    <Shell>
      <section className="pt-6 sm:pt-10">
        <span className="pill bg-forest/5 text-forest ring-1 ring-forest/10">
          <span className="h-1.5 w-1.5 rounded-full bg-moss" />
          Devnet demo · Solana
        </span>
        <h1 className="mt-5 text-[2.6rem] font-bold leading-[1.02] tracking-[-0.04em] sm:text-6xl">
          Your savings circle,
          <span className="block text-moss">held by code.</span>
        </h1>
        <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-ink/65">
          Ajo, chama, tanda, susu. One shared pot, one member paid each round,
          and no collector holding the cash.
        </p>

        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
          <Link href="/create" className="btn-primary flex-1">
            Start a circle
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/circles" className="btn-ghost flex-1">
            Join with an invite
          </Link>
        </div>
      </section>

      <section className="relative mx-auto mt-10 w-full max-w-[360px]">
        <div className="relative aspect-square">
          <div className="absolute inset-0 rounded-full border border-forest/10" />
          <div className="absolute inset-7 rounded-full border border-dashed border-forest/15" />
          <div className="absolute left-1/2 top-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-forest text-cream shadow-soft">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cream/55">
              Round pot
            </span>
            <span className="text-3xl font-bold tracking-tight">$100</span>
            <span className="mt-0.5 text-[10px] text-cream/55">5 × $20</span>
          </div>

          {members.map((member, i) => {
            const angle = (i * 360) / members.length;
            return (
              <div
                key={member.name}
                className="absolute left-1/2 top-1/2"
                style={{
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-152px) rotate(-${angle}deg)`,
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold shadow-lift ring-4 ring-cream ${member.color}`}
                  >
                    {member.initial}
                  </div>
                  <span className="text-[10px] font-semibold text-ink/55">
                    {member.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["$100", "pot per round"],
          ["$80", "refundable deposit"],
          ["1.5%", "payout fee"],
        ].map(([value, label]) => (
          <div key={label} className="card-flat text-center">
            <div className="text-lg font-bold tracking-tight">{value}</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/45">
              {label}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">How a circle works</h2>
        <div className="mt-4 space-y-3">
          {steps.map((step) => (
            <div key={step.n} className="card flex gap-4">
              <span className="mono mt-0.5 text-xs font-bold text-gold">
                {step.n}
              </span>
              <div>
                <h3 className="text-sm font-bold">{step.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink/60">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-3xl bg-forest p-6 text-cream shadow-soft">
        <h2 className="text-xl font-bold tracking-tight">
          The deposit is the trust layer.
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-cream/70">
          Everyone locks the same refundable amount:{" "}
          <span className="font-semibold text-cream">
            contribution × (members − 1)
          </span>
          . If someone misses a round, the group covers it from their deposit
          and the payout still goes through. At the end, the rest goes back.
        </p>
        <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-cream/55">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          No collector. No WhatsApp notebook. No exit scam.
        </div>
      </section>

      <footer className="mt-10 pb-2 text-center text-[11px] text-ink/40">
        Built on Solana devnet for Dev3pack 2026. Test USDC only.
      </footer>
    </Shell>
  );
}
