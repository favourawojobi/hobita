"use client";

import {
  BaseWalletAdapter,
  WalletName,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

const STORAGE_KEY = "hobita.demo.wallets";
const NAMES = ["Amara", "Tunde", "Maya", "Jide", "Sofia"];

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='12' fill='%23123C2E'/%3E%3Ccircle cx='15' cy='20' r='8' fill='%23F7F1E7'/%3E%3Ccircle cx='25' cy='20' r='8' fill='%23E0A84C' fill-opacity='0.92'/%3E%3Ccircle cx='20' cy='20' r='3.2' fill='%23123C2E'/%3E%3C/svg%3E";

function readSecrets(): number[][] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length === NAMES.length) {
      return parsed as number[][];
    }
  } catch {
    // fall through and regenerate
  }
  const generated = NAMES.map(() => Array.from(Keypair.generate().secretKey));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(generated));
  return generated;
}

export function getDemoKeypair(index: number): Keypair {
  const secrets = readSecrets();
  const secret = secrets[index] ?? secrets[0];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function getDemoKeypairs(): Keypair[] {
  return readSecrets().map((secret) =>
    Keypair.fromSecretKey(Uint8Array.from(secret)),
  );
}

export function demoPublicKeys(): PublicKey[] {
  return getDemoKeypairs().map((keypair) => keypair.publicKey);
}

export function isDemoWallet(wallet: PublicKey | null): boolean {
  if (!wallet) return false;
  return demoPublicKeys().some((key) => key.equals(wallet));
}

export class DemoWalletAdapter extends BaseWalletAdapter {
  name: WalletName<string>;
  url = "https://hobita.vercel.app";
  icon = ICON;
  readyState = WalletReadyState.Installed;
  supportedTransactionVersions = null;
  private index: number;
  private key: PublicKey | null = null;
  private pending = false;

  constructor(index: number) {
    super();
    this.index = index;
    this.name = `Demo · ${NAMES[index]}` as WalletName<string>;
  }

  get publicKey() {
    return this.key;
  }

  get connected() {
    return this.key !== null;
  }

  get connecting() {
    return this.pending;
  }

  async connect() {
    try {
      this.pending = true;
      this.emit("connect", "start");
      const keypair = getDemoKeypair(this.index);
      this.key = keypair.publicKey;
      this.pending = false;
      this.emit("connect", this.key);
    } catch (error) {
      this.pending = false;
      this.emit("error", error as Error);
      throw error;
    }
  }

  async disconnect() {
    this.emit("disconnect");
    this.key = null;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
  ): Promise<T> {
    if (!this.key) throw new Error("Wallet not connected");
    if (transaction instanceof VersionedTransaction) {
      transaction.sign([getDemoKeypair(this.index)]);
      return transaction;
    }
    transaction.partialSign(getDemoKeypair(this.index));
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[],
  ): Promise<T[]> {
    return Promise.all(transactions.map((tx) => this.signTransaction(tx)));
  }
}

export const DEMO_NAMES = NAMES;
