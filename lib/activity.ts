"use client";

import { getDemoKeypairs, DEMO_NAMES } from "@/components/DemoWalletAdapter";
import { supabase } from "@/lib/supabase";
import type { CircleAccount, MemberWithKey } from "@/lib/hobita";
import { statusOf } from "@/lib/hobita";

export type ActivityRow = {
  id: number;
  wallet: string;
  kind: string;
  round: number;
  amount: number | null;
  message: string;
  created_at: string;
};

function demoLabels() {
  const labels: Record<string, string> = {};
  const keypairs = getDemoKeypairs();
  keypairs.forEach((keypair, index) => {
    labels[keypair.publicKey.toBase58()] = DEMO_NAMES[index];
  });
  return labels;
}

export async function syncCircle(
  address: string,
  circle: CircleAccount,
  members: MemberWithKey[],
  name: string,
) {
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        circle: {
          address,
          name: name || undefined,
          creator: circle.creator.toBase58(),
          tokenMint: circle.tokenMint.toBase58(),
          contribution: Number(circle.contribution.toString()),
          periodSeconds: circle.periodSeconds.toNumber(),
          maxMembers: circle.maxMembers,
          status: statusOf(circle),
          currentRound: circle.currentRound,
          startTs: circle.startTs.toNumber(),
        },
        members: members.map((member) => ({
          wallet: member.account.wallet.toBase58(),
          slot: member.account.slot,
          collateral: Number(member.account.collateral.toString()),
          collateralRemaining: Number(
            member.account.collateralRemaining.toString(),
          ),
          paidRounds: member.account.paidRounds,
          coveredRounds: member.account.coveredRounds,
          hasReceivedPayout: member.account.hasReceivedPayout,
        })),
        labels: demoLabels(),
      }),
    });
  } catch {
    // Supabase is optional; the chain remains the source of truth.
  }
}

export async function fetchActivity(circle: string) {
  try {
    const response = await fetch(`/api/activity?circle=${circle}`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { activity?: ActivityRow[] };
    return data.activity ?? [];
  } catch {
    return [];
  }
}

export async function fetchCircleNames() {
  try {
    const response = await fetch("/api/circles", { cache: "no-store" });
    if (!response.ok) return {} as Record<string, string>;
    const data = (await response.json()) as {
      circles?: { address: string; name: string | null }[];
    };
    const names: Record<string, string> = {};
    for (const circle of data.circles ?? []) {
      if (circle.address && circle.name) names[circle.address] = circle.name;
    }
    return names;
  } catch {
    return {} as Record<string, string>;
  }
}

export async function fetchCircleName(address: string) {
  try {
    const response = await fetch(`/api/circles?address=${address}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      circle?: { name: string | null } | null;
    };
    return data.circle?.name ?? null;
  } catch {
    return null;
  }
}

export function subscribeActivity(
  circle: string,
  onInsert: (row: ActivityRow) => void,
) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`activity:${circle}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activity",
        filter: `circle_address=eq.${circle}`,
      },
      (payload) => onInsert(payload.new as ActivityRow),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
