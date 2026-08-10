import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { WorkerHome } from "@/components/WorkerHome";
import type { ShiftReport } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role === "admin") redirect("/"); // admins use the dashboard

  const supabase = supabaseServer();
  const now = new Date();
  const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
  const to = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString();

  const [{ data: open }, { data: month }, { count: consentCount }] = await Promise.all([
    supabase.from("shifts").select("*").eq("user_id", profile.id).eq("status", "open").maybeSingle(),
    supabase
      .from("shifts")
      .select("*")
      .eq("user_id", profile.id)
      .eq("status", "closed")
      .gte("started_at", from)
      .lt("started_at", to)
      .order("started_at", { ascending: false }),
    supabase.from("consents").select("*", { count: "exact", head: true }).eq("user_id", profile.id).eq("granted", true),
  ]);

  return (
    <WorkerHome
      profile={profile}
      openShift={open ?? null}
      monthShifts={(month ?? []) as unknown as ShiftReport[]}
      approved={profile.is_approved !== false}
      hasConsent={(consentCount ?? 0) > 0}
    />
  );
}
