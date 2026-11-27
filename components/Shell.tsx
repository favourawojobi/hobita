"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Logo } from "@/components/Logo";

const tabs = [
  {
    href: "/",
    label: "Home",
    icon: (
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/create",
    label: "Start",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/circles",
    label: "Circles",
    icon: (
      <>
        <circle cx="9" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="15" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[540px] flex-col px-4 pb-32 pt-3 sm:px-6">
      <header className="flex items-center justify-between py-2">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-lg font-bold tracking-tight">Hobita</span>
        </Link>
        <WalletMultiButton />
      </header>

      <main className="flex-1">{children}</main>

      <nav className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-[500px] -translate-x-1/2 items-center justify-around rounded-full border border-forest/10 bg-white/90 px-2 py-2 shadow-lift backdrop-blur">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-w-[84px] flex-col items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                active ? "bg-forest text-cream" : "text-ink/50 hover:text-ink"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
