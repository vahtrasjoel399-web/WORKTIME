import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("v_shift_report")
    .select("first_name, last_name, site_name, start_lat, start_lng, started_at, out_of_zone")
    .eq("status", "open");

  const points = (data ?? [])
    .filter((s) => s.start_lat != null && s.start_lng != null)
    .map((s) => ({
      lat: s.start_lat,
      lng: s.start_lng,
      label: `${s.first_name} ${s.last_name} · ${s.site_name ?? "—"}`,
      color: s.out_of_zone ? "#E2574C" : "#2FBF71",
      started_at: s.started_at,
    }));

  return NextResponse.json(points);
}
