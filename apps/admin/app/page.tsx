import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { hours1, money } from "@/lib/format";
import { resolveEarnings } from "@/lib/report";
import { isoWeek, parseYmd, weekRange } from "@/lib/week";
import { AddWorker } from "@/components/AddWorker";
import { PendingWorkers } from "@/components/PendingWorkers";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { Icon } from "@/components/Icon";
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
        .select("user_id, worked_seconds")
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
  for (const s of weekShifts ?? []) {
    weekSeconds.set(s.user_id, (weekSeconds.get(s.user_id) ?? 0) + (s.worked_seconds ?? 0));
  }

  const all = (workers ?? []) as Profile[];
  const pending = all.filter((w) => w.is_approved === false);
  const list = all.filter((w) => w.is_approved !== false);
  const onShift = list.filter((w) => openBy.has(w.id)).length;

  // gross owed for the running week, per worker and in total
  const weekEarned = new Map<string, number>();
  for (const w of list) {
    weekEarned.set(
      w.id,
      resolveEarnings(weekSeconds.get(w.id) ?? 0, w.hourly_rate, w.self_hourly_rate).amount,
    );
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
    <div className="space-y-6">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Töötajad</h1>
          <p className="mt-1 text-sm text-muted">
            {list.length} töötajat · <span className="text-live">{onShift} vahetuses</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Nädal {isoWeek(parseYmd(week.from))} ({week.from.slice(8)}.{week.from.slice(5, 7)}–
            {week.to.slice(8)}.{week.to.slice(5, 7)}) · {hours1(weekHours)} h ·{" "}
            <span className="font-semibold text-signal">{money(payroll, currency)}</span> palgafond
          </p>
          {company?.join_code && (
            <p className="mt-2 text-sm text-muted">
              Ettevõtte kood töötajatele:{" "}
              <span className="tabular font-semibold tracking-widest text-signal">{company.join_code}</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 items-center gap-2 sm:flex">
          <Link
            href="/reports"
            className="flex items-center justify-center rounded-lg border border-border px-3 py-2 text-center text-sm font-medium hover:border-signal sm:px-4"
          >
            Nädala aruanne →
          </Link>
          <AddWorker sites={siteList} companyId={me.company_id} actorId={me.id} />
        </div>
      </div>

      <PendingWorkers pending={pending} />

      {list.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <Icon name="empty" className="mx-auto mb-4 h-10 w-10 text-muted" />
          <h2 className="font-display text-lg font-semibold">Töötajaid pole veel</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Lisa esimene töötaja või jaga ettevõtte koodi, et tiim saaks liituda.</p>
        </div>
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
