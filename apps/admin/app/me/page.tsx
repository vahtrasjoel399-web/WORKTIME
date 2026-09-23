import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { WorkerHome } from "@/components/WorkerHome";
import { addWeeks, startOfWeek } from "@/lib/week";
import type { ShiftReport } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role === "admin") redirect("/");
  if (profile.role === "accountant") redirect("/reports");

  const supabase = await supabaseServer();
  // Pay runs weekly (D-015): load the last 8 pay weeks so the worker can check the
  // week they were paid for, plus the running one. That window also covers the
  // whole current month, which the screen still shows as context.
  const from = startOfWeek(addWeeks(new Date(), -7)).toISOString();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);

  const [{ data: open }, { data: recent }, { count: consentCount }, { data: rates }, { data: sites }, { data: adjustments }] = await Promise.all([
    supabase.from("shifts").select("*").eq("user_id", profile.id).eq("status", "open").maybeSingle(),
    supabase
      .from("v_shift_report")
      .select("*")
      .eq("user_id", profile.id)
      .eq("status", "closed")
      .gte("started_at", from)
      .order("started_at", { ascending: false }),
    supabase
      .from("consents")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("kind", "geolocation_notice")
      .eq("version", "2")
      .eq("granted", true),
    supabase.from("worker_rates").select("*").eq("employee_id", profile.id).eq("is_active", true).order("created_at"),
    supabase.from("sites").select("*").eq("company_id", profile.company_id),
    supabase.from("monthly_adjustments").select("*").eq("employee_id", profile.id).eq("period_month", monthStart).order("created_at"),
  ]);

  return (
    <WorkerHome
      profile={profile}
      openShift={open ?? null}
      shifts={(recent ?? []) as unknown as ShiftReport[]}
      approved={profile.is_approved !== false}
      hasConsent={(consentCount ?? 0) > 0}
      rates={rates ?? []}
      sites={sites ?? []}
      adjustments={adjustments ?? []}
    />
  );
}
