"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export function FaucetButton({
  amount = 500,
  className = "btn-ghost w-full",
}: {
  amount?: number;
  className?: string;
}) {
  const { publicKey, connected } = useWallet();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function claim() {
    if (!publicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          amount,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        signature?: string;
      };
      if (!response.ok) throw new Error(data.error || "Faucet failed");
      setMessage(`+${amount} test USDC added`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Faucet failed");
    } finally {
      setBusy(false);
    }
  }

  if (!connected) return null;

  return (
    <div>
      <button
        type="button"
        onClick={claim}
        disabled={busy}
        className={className}
      >
        {busy ? "Sending test USDC…" : `Get ${amount} test USDC`}
      </button>
      {message && (
        <p className="mt-2 text-center text-[11px] font-medium text-moss">
          {message}
        </p>
      )}
    </div>
  );
}
