"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as AdapterProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import { DemoWalletAdapter, DEMO_NAMES } from "@/components/DemoWalletAdapter";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint =
    process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet");

  const wallets = useMemo(
    () => [
      ...DEMO_NAMES.map((_, index) => new DemoWalletAdapter(index)),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <AdapterProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </AdapterProvider>
    </ConnectionProvider>
  );
}
