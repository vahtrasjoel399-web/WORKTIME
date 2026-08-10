import { supabaseServer } from "@/lib/supabase-server";
import { LiveMap } from "@/components/LiveMap";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("v_shift_report")
    .select("id, user_id, first_name, last_name, site_name, start_lat, start_lng, started_at, out_of_zone")
    .eq("status", "open");

  const points = (data ?? [])
    .filter((s) => s.start_lat != null && s.start_lng != null)
    .map((s) => ({
      lat: s.start_lat as number,
      lng: s.start_lng as number,
      label: `${s.first_name} ${s.last_name} · ${s.site_name ?? "—"}`,
      color: s.out_of_zone ? "#E2574C" : "#2FBF71",
      started_at: s.started_at as string,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Elav kaart</h1>
        <p className="mt-1 text-sm text-muted">
          {points.length} töötajat hetkel vahetuses. Punane tähis = väljaspool objekti tsooni.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface p-2">
        <LiveMap points={points} />
      </div>
    </div>
  );
}
