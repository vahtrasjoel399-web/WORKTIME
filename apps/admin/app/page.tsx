import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { hours1, money } from "@/lib/format";
import { shiftTotal } from "@/lib/pricing";
import { isoWeek, parseYmd, weekRange } from "@/lib/week";
import { AddWorker } from "@/components/AddWorker";
import { PendingWorkers } from "@/components/PendingWorkers";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { EmptyState, MetricStrip, PageHeader } from "@/components/ui";
import type { Profile, Site } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/me"); // workers get their own screen

  const supabase = await supabaseServer();
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
      supabase.from("profiles").select("*").eq("role", "worker").order("last_name"),
      supabase
        .from("shifts")
        .select("user_id, site_id, started_at, start_lat, start_lng, start_address")
        .eq("status", "open"),
      supabase
        .from("shifts")
        .select("user_id, worked_seconds, pricing_type, pricing_rate, quantity, calculated_total")
        .eq("status", "closed")
        .gte("started_at", from)
        .lt("started_at", to),
      supabase.from("sites").select("*"),
      supabase
        .from("employee_assignments")
        .select("employee_id, site_id, start_date")
        .is("end_date", null),
      supabase.from("companies").select("name, join_code").limit(1).maybeSingle(),
    ]);

  const siteList = (sites ?? []) as Site[];
  const openBy = new Map((openShifts ?? []).map((o) => [o.user_id, o]));
  const weekSeconds = new Map<string, number>();
  const weekEarned = new Map<string, number>();
  for (const s of weekShifts ?? []) {
    weekSeconds.set(s.user_id, (weekSeconds.get(s.user_id) ?? 0) + (s.worked_seconds ?? 0));
  }

  const all = (workers ?? []) as Profile[];
  const pending = all.filter((w) => w.is_approved === false);
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
  if (photoPaths.length > 0) {
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
        eyebrow={company?.name ?? "Tööjõu ülevaade"}
        title="Töötajad"
        description={<>Nädal {isoWeek(parseYmd(week.from))} · {week.from.slice(8)}.{week.from.slice(5, 7)}–{week.to.slice(8)}.{week.to.slice(5, 7)}</>}
        actions={
          <>
          <Link
            href="/reports"
            className="btn-secondary"
          >
            Nädala aruanne
          </Link>
          <AddWorker sites={siteList} companyId={me.company_id} actorId={me.id} />
          </>
        }
      />

      <MetricStrip items={[
        { label: "Töötajaid", value: list.length, detail: `${list.filter((worker) => worker.is_active).length} aktiivset` },
        { label: "Praegu tööl", value: onShift, detail: onShift === 1 ? "1 avatud vahetus" : `${onShift} avatud vahetust`, tone: "live" },
        { label: "Nädala tööaeg", value: `${hours1(weekHours)} h`, detail: `Nädal ${isoWeek(parseYmd(week.from))}` },
        { label: "Nädala palgafond", value: money(payroll, currency), detail: "Bruto, hinnanguline", tone: "signal" },
      ]} />

      {company?.join_code && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span><span className="font-medium">Liitumiskood</span><span className="text-muted"> · jaga seda töötajaga konto loomiseks</span></span>
          <span className="tabular select-all font-semibold tracking-[0.18em] text-primary">{company.join_code}</span>
        </div>
      )}

      <PendingWorkers pending={pending} />

      {list.length === 0 && (
        <EmptyState title="Töötajaid pole veel" description="Lisa esimene töötaja või jaga ettevõtte liitumiskoodi, et tiim saaks liituda." />
      )}

      {list.length > 0 && (
        <EmployeeDirectory
          workers={list}
          sites={siteList}
          openShifts={openShifts ?? []}
          assignments={assignments ?? []}
          weekSeconds={weekSecondsRecord}
          weekEarned={weekEarnedRecord}
          photoUrls={photoUrls}
        />
      )}
    </div>
  );
}
