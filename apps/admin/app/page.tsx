import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { hours1, money } from "@/lib/format";
import { shiftTotal } from "@/lib/pricing";
import { isoWeek, parseYmd, weekRange } from "@/lib/week";
import { AddWorker } from "@/components/AddWorker";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { EmptyState, MetricStrip, PageHeader } from "@/components/ui";
import type { Profile, Site } from "@/lib/types";
import { T } from "@/components/T";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role === "worker") redirect("/me");

  const supabase = await supabaseServer();
  const db = me.role === "accountant" ? supabaseService() : supabase;
  const readOnly = me.role === "accountant";
  // Pay runs weekly (D-015): the list shows the running Mon-Sun week, not the month.
  const week = weekRange(new Date());
  const from = parseYmd(week.from).toISOString();
  const toDate = parseYmd(week.to);
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  const to = toDate.toISOString();

  const [
    { data: workers },
    { data: openShifts },
    { data: weekShifts },
    { data: sites },
    { data: assignments },
    { data: company },
  ] =
    await Promise.all([
      db.from("profiles").select("*").eq("company_id", me.company_id).eq("role", "worker").order("last_name"),
      db
        .from("shifts")
        .select("user_id, site_id, started_at, start_lat, start_lng, start_address")
        .eq("company_id", me.company_id)
        .eq("status", "open"),
      db
        .from("shifts")
        .select("user_id, worked_seconds, pricing_type, pricing_rate, quantity, calculated_total")
        .eq("company_id", me.company_id)
        .eq("status", "closed")
        .gte("started_at", from)
        .lt("started_at", to),
      db.from("sites").select("*").eq("company_id", me.company_id),
      db
        .from("employee_assignments")
        .select("employee_id, site_id, start_date")
        .eq("company_id", me.company_id)
        .is("end_date", null),
      db.from("companies").select("name").eq("id", me.company_id).maybeSingle(),
    ]);

  const siteList = (sites ?? []) as Site[];
  const openBy = new Map((openShifts ?? []).map((o) => [o.user_id, o]));
  const directoryOpenShifts = readOnly
    ? (openShifts ?? []).map((shift) => ({ ...shift, start_lat: null, start_lng: null, start_address: null }))
    : (openShifts ?? []);
  const weekSeconds = new Map<string, number>();
  const weekEarned = new Map<string, number>();
  for (const s of weekShifts ?? []) {
    weekSeconds.set(s.user_id, (weekSeconds.get(s.user_id) ?? 0) + (s.worked_seconds ?? 0));
  }

  const all = (workers ?? []) as Profile[];
  const list = all.filter((w) => w.is_approved !== false);
  const onShift = list.filter((w) => openBy.has(w.id)).length;

  // gross owed for the running week, per worker and in total
  for (const w of list) {
    const fallbackRate = w.pricing_type === "hourly" ? w.hourly_rate ?? w.self_hourly_rate : w.hourly_rate;
    const amount = (weekShifts ?? [])
      .filter((shift) => shift.user_id === w.id)
      .reduce((sum, shift) => sum + shiftTotal(shift, fallbackRate), 0);
    weekEarned.set(w.id, amount);
  }
  const payroll = [...weekEarned.values()].reduce((a, b) => a + b, 0);
  const weekHours = [...weekSeconds.values()].reduce((a, b) => a + b, 0);
  const currency = list[0]?.currency ?? "EUR";
  const photoPaths = list.flatMap((worker) => worker.profile_photo_path ? [worker.profile_photo_path] : []);
  const photoUrls: Record<string, string> = {};
  if (!readOnly && photoPaths.length > 0) {
    const { data: signedPhotos } = await supabase.storage
      .from("employee-files")
      .createSignedUrls(photoPaths, 3600);
    const signedByPath = new Map(
      (signedPhotos ?? []).flatMap((photo) => photo.signedUrl ? [[photo.path, photo.signedUrl] as const] : []),
    );
    for (const worker of list) {
      if (worker.profile_photo_path) {
        const signedUrl = signedByPath.get(worker.profile_photo_path);
        if (signedUrl) photoUrls[worker.id] = signedUrl;
      }
    }
  }

  const weekSecondsRecord = Object.fromEntries(weekSeconds);
  const weekEarnedRecord = Object.fromEntries(weekEarned);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={company?.name ?? <T id="workforceOverview" />}
        title={<T id="employees" />}
        description={<>Nädal {isoWeek(parseYmd(week.from))} · {week.from.slice(8)}.{week.from.slice(5, 7)}–{week.to.slice(8)}.{week.to.slice(5, 7)}</>}
        actions={
          <>
          <Link
            href="/reports"
            className="btn-secondary"
          >
            <T id="weeklyReport" />
          </Link>
          {!readOnly && <AddWorker sites={siteList} companyId={me.company_id} actorId={me.id} />}
          </>
        }
      />

      <MetricStrip items={[
        { label: <T id="employeeCount" />, value: list.length, detail: `${list.filter((worker) => worker.is_active).length} aktiivset` },
        { label: <T id="workingNow" />, value: onShift, detail: onShift === 1 ? "1 avatud vahetus" : `${onShift} avatud vahetust`, tone: "live" },
        { label: <T id="weeklyHours" />, value: `${hours1(weekHours)} h`, detail: <><T id="week" /> {isoWeek(parseYmd(week.from))}</> },
        { label: <T id="weeklyPayroll" />, value: money(payroll, currency), detail: <T id="estimatedGross" />, tone: "signal" },
      ]} />

      {list.length === 0 && (
        <EmptyState title="Töötajaid pole veel" description={readOnly ? "Ettevõttes pole veel töötajaid." : "Lisa esimene töötaja. Konto ja ajutise parooli loob administraator."} />
      )}

      {list.length > 0 && (
        <EmployeeDirectory
          workers={list}
          sites={siteList}
          openShifts={directoryOpenShifts}
          assignments={assignments ?? []}
          weekSeconds={weekSecondsRecord}
          weekEarned={weekEarnedRecord}
          photoUrls={photoUrls}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
