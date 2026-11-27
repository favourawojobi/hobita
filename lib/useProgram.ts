"use client";

import { useMemo } from "react";
import { AnchorProvider } from "@anchor-lang/core";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { getProgram } from "@/lib/hobita";

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return getProgram(provider);
  }, [connection, wallet]);
}
