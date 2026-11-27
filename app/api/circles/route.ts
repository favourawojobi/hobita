import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ circles: [], configured: false });

  const address = new URL(request.url).searchParams.get("address");

  if (address) {
    const { data } = await admin
      .from("circles")
      .select("address, name, description")
      .eq("address", address)
      .maybeSingle();
    return NextResponse.json({ circle: data ?? null, configured: true });
  }

  const { data, error } = await admin
    .from("circles")
    .select("address, name")
    .not("name", "is", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ circles: [], error: error.message });
  }

  return NextResponse.json({ circles: data ?? [], configured: true });
}
