import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ activity: [], configured: false });

  const circle = new URL(request.url).searchParams.get("circle");
  if (!circle || circle.length < 32) {
    return NextResponse.json({ error: "invalid circle" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("activity")
    .select("id, wallet, kind, round, amount, message, created_at")
    .eq("circle_address", circle)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    return NextResponse.json({ activity: [], error: error.message });
  }

  return NextResponse.json({ activity: data ?? [], configured: true });
}
