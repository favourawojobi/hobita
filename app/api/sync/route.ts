import { NextResponse } from "next/server";
import {
  formatUsdc,
  getAdmin,
  shortWallet,
} from "@/lib/supabase-admin";

type CirclePayload = {
  address: string;
  name?: string;
  creator: string;
  tokenMint: string;
  contribution: number;
  periodSeconds: number;
  maxMembers: number;
  status: string;
  currentRound: number;
  startTs: number;
};

type MemberPayload = {
  wallet: string;
  slot: number;
  collateral: number;
  collateralRemaining: number;
  paidRounds: number;
  coveredRounds: number;
  hasReceivedPayout: boolean;
};

const STATUSES = new Set(["open", "active", "completed", "cancelled"]);

function cleanText(value: unknown, max = 60) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function toInt(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(Math.floor(number), max));
}

export async function POST(request: Request) {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ configured: false }, { status: 204 });
  }

  try {
    const body = (await request.json()) as {
      circle?: CirclePayload;
      members?: MemberPayload[];
      labels?: Record<string, string>;
    };

    const input = body.circle;
    if (!input || typeof input.address !== "string" || input.address.length < 32) {
      return NextResponse.json({ error: "invalid circle" }, { status: 400 });
    }
    if (typeof input.creator !== "string" || input.creator.length < 32) {
      return NextResponse.json({ error: "invalid creator" }, { status: 400 });
    }

    const address = input.address;
    const name = cleanText(input.name, 40);
    const contribution = toInt(input.contribution, 1_000_000_000_000);
    const periodSeconds = toInt(input.periodSeconds, 31_536_000);
    const maxMembers = toInt(input.maxMembers, 16);
    const currentRound = toInt(input.currentRound, 16);
    const status = STATUSES.has(input.status) ? input.status : "open";

    const members = (Array.isArray(body.members) ? body.members : [])
      .filter(
        (member) =>
          typeof member?.wallet === "string" && member.wallet.length >= 32,
      )
      .slice(0, 16);

    const circleRow: Record<string, unknown> = {
      address,
      creator_wallet: input.creator,
      token_mint: typeof input.tokenMint === "string" ? input.tokenMint : null,
      contribution,
      period_seconds: periodSeconds,
      max_members: maxMembers,
      status,
      current_round: currentRound,
      updated_at: new Date().toISOString(),
    };
    if (name) circleRow.name = name;

    const { error: circleError } = await admin
      .from("circles")
      .upsert(circleRow, { onConflict: "address" });
    if (circleError) throw circleError;

    if (members.length > 0) {
      const { error: memberError } = await admin.from("circle_members").upsert(
        members.map((member) => ({
          circle_address: address,
          wallet: member.wallet,
          slot: toInt(member.slot, 16),
          collateral: toInt(member.collateral),
          collateral_remaining: toInt(member.collateralRemaining),
          paid_rounds: toInt(member.paidRounds, 65_535),
          covered_rounds: toInt(member.coveredRounds, 65_535),
          received_payout: Boolean(member.hasReceivedPayout),
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "circle_address,wallet" },
      );
      if (memberError) throw memberError;
    }

    const wallets = members.map((member) => member.wallet);
    const labels = new Map<string, string>();
    if (wallets.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("wallet, display_name")
        .in("wallet", wallets);
      for (const profile of profiles ?? []) {
        if (profile.display_name) {
          labels.set(profile.wallet, profile.display_name);
        }
      }
    }
    for (const [wallet, label] of Object.entries(body.labels ?? {})) {
      const clean = cleanText(label, 24);
      if (clean && typeof wallet === "string") labels.set(wallet, clean);
    }
    const labelFor = (wallet: string) =>
      labels.get(wallet) || shortWallet(wallet);

    const rows: {
      circle_address: string;
      wallet: string;
      kind: string;
      round: number;
      amount: number | null;
      message: string;
    }[] = [];

    const creatorLabel = labelFor(input.creator);
    rows.push({
      circle_address: address,
      wallet: "",
      kind: "opened",
      round: 0,
      amount: contribution * maxMembers,
      message: `${creatorLabel} opened ${name ? `“${name}”` : "a circle"} · ${maxMembers} slots at ${formatUsdc(contribution)} USDC per round`,
    });

    for (const member of members) {
      const label = labelFor(member.wallet);
      rows.push({
        circle_address: address,
        wallet: member.wallet,
        kind: "joined",
        round: 0,
        amount: toInt(member.collateral),
        message: `${label} joined and locked ${formatUsdc(toInt(member.collateral))} USDC`,
      });

      for (let round = 1; round <= maxMembers; round += 1) {
        const bit = 1 << (round - 1);
        if (toInt(member.paidRounds, 65_535) & bit) {
          rows.push({
            circle_address: address,
            wallet: member.wallet,
            kind: "contribution",
            round,
            amount: contribution,
            message: `${label} paid ${formatUsdc(contribution)} USDC for round ${round}`,
          });
        }
        if (toInt(member.coveredRounds, 65_535) & bit) {
          rows.push({
            circle_address: address,
            wallet: member.wallet,
            kind: "covered",
            round,
            amount: contribution,
            message: `${label}'s round ${round} was covered from their deposit`,
          });
        }
      }

      if (member.hasReceivedPayout) {
        const round = toInt(member.slot, 16);
        rows.push({
          circle_address: address,
          wallet: member.wallet,
          kind: "payout",
          round,
          amount: contribution * maxMembers,
          message: `${label} collected the round ${round} pot`,
        });
      }
    }

    if (status === "active" || status === "completed") {
      rows.push({
        circle_address: address,
        wallet: "",
        kind: "started",
        round: 0,
        amount: null,
        message: `Circle started · ${maxMembers} members, ${maxMembers} rounds`,
      });
    }
    if (status === "completed") {
      rows.push({
        circle_address: address,
        wallet: "",
        kind: "completed",
        round: 0,
        amount: null,
        message: "The circle completed — every member had a turn",
      });
    }

    const { error: activityError } = await admin.from("activity").upsert(rows, {
      onConflict: "circle_address,kind,wallet,round",
      ignoreDuplicates: true,
    });
    if (activityError) throw activityError;

    return NextResponse.json({ ok: true, synced: rows.length });
  } catch (error) {
    return NextResponse.json(
      {
        error: "sync_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
