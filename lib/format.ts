import { BN } from "@anchor-lang/core";

export function usdc(
  amount: BN | number | bigint,
  options: { decimals?: number; compact?: boolean } = {},
) {
  const raw =
    typeof amount === "number"
      ? amount
      : Number(amount.toString()) / 1_000_000;
  const decimals = options.decimals ?? (raw < 1 ? 2 : 0);
  return raw.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function usd(amount: BN | number | bigint, options?: { decimals?: number }) {
  return `$${usdc(amount, options)}`;
}

export function shortKey(key: { toBase58(): string } | string) {
  const value = typeof key === "string" ? key : key.toBase58();
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function explorerTx(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddress(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function readableError(error: unknown) {
  const anyError = error as {
    message?: string;
    error?: { errorMessage?: string };
    logs?: string[];
  };
  const message =
    anyError?.error?.errorMessage ||
    anyError?.message ||
    String(error);
  if (message.includes("User rejected")) return "You rejected the transaction.";
  if (message.includes("insufficient funds")) return "Not enough SOL for network fees.";
  if (message.includes("0x1")) return "Not enough test USDC for this action.";
  return message.length > 180 ? `${message.slice(0, 177)}…` : message;
}
