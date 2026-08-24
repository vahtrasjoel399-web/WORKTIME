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
  if (profile.role === "admin") redirect("/"); // admins use the dashboard

  const supabase = supabaseServer();
  // Pay runs weekly (D-015): load the last 8 pay weeks so the worker can check the
  // week they were paid for, plus the running one. That window also covers the
  // whole current month, which the screen still shows as context.
  const from = startOfWeek(addWeeks(new Date(), -7)).toISOString();

  const [{ data: open }, { data: recent }, { count: consentCount }] = await Promise.all([
    supabase.from("shifts").select("*").eq("user_id", profile.id).eq("status", "open").maybeSingle(),
    supabase
      .from("shifts")
      .select("*")
      .eq("user_id", profile.id)
      .eq("status", "closed")
      .gte("started_at", from)
      .order("started_at", { ascending: false }),
    supabase.from("consents").select("*", { count: "exact", head: true }).eq("user_id", profile.id).eq("granted", true),
  ]);

  return (
    <WorkerHome
      profile={profile}
      openShift={open ?? null}
      shifts={(recent ?? []) as unknown as ShiftReport[]}
      approved={profile.is_approved !== false}
      hasConsent={(consentCount ?? 0) > 0}
    />
  );
}
