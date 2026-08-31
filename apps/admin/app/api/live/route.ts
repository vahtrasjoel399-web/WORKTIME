import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  if (profile.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("v_shift_report")
    .select("first_name, last_name, site_name, start_lat, start_lng, started_at, out_of_zone")
    .eq("status", "open");
  if (error) {
    console.error("Live shift query failed", error.message);
    return new NextResponse("Could not load live shifts", { status: 500 });
  }

  const points = (data ?? [])
    .filter((s) => s.start_lat != null && s.start_lng != null)
    .map((s) => ({
      lat: s.start_lat,
      lng: s.start_lng,
      label: `${s.first_name} ${s.last_name} · ${s.site_name ?? "—"}`,
      color: s.out_of_zone ? "#E2574C" : "#2FBF71",
      started_at: s.started_at,
    }));

  return NextResponse.json(points, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
