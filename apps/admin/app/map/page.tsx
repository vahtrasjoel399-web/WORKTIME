import { supabaseServer } from "@/lib/supabase-server";
import { LiveMap } from "@/components/LiveMap";
import { PageHeader, StatusBadge } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(me.role === "accountant" ? "/reports" : "/me");
  const supabase = await supabaseServer();
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
    <div className="page-stack">
      <PageHeader eyebrow="Hetkeolukord" title="Elav kaart" description="Kaardil kuvatakse vahetuse alustamise asukoht. Asukohta ei jälgita taustal." actions={<StatusBadge tone={points.length > 0 ? "live" : "neutral"}>{points.length} praegu tööl</StatusBadge>} />
      <div className="panel overflow-hidden p-2">
        <LiveMap points={points} />
      </div>
    </div>
  );
}
