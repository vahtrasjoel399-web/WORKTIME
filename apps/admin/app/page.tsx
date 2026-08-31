import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { hours1, money } from "@/lib/format";
import { resolveEarnings } from "@/lib/report";
import { isoWeek, parseYmd, weekRange } from "@/lib/week";
import { distanceLabel, matchSite, shortAddress } from "@/lib/geo";
import { AddWorker } from "@/components/AddWorker";
import { PendingWorkers } from "@/components/PendingWorkers";
import { DeleteWorker } from "@/components/DeleteWorker";
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

  const [{ data: workers }, { data: openShifts }, { data: weekShifts }, { data: sites }, { data: company }] =
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
      supabase.from("companies").select("name, join_code").limit(1).maybeSingle(),
    ]);

  const siteList = (sites ?? []) as Site[];
  const siteById = new Map(siteList.map((s) => [s.id, s]));
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
          <AddWorker />
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

      <div className="space-y-3 sm:hidden">
        {list.map((w, i) => {
          const open = openBy.get(w.id);
          const fix = open ? matchSite(open.start_lat, open.start_lng, siteList) : null;
          const site = open?.site_id ? siteById.get(open.site_id) ?? null : fix?.site ?? null;
          const secs = weekSeconds.get(w.id) ?? 0;
          const rate = w.hourly_rate ?? w.self_hourly_rate ?? null;
          return <Link key={w.id} href={`/workers/${w.id}`} className="rise block rounded-2xl border border-border bg-surface p-4 shadow-sm transition active:scale-[.99]" style={{ animationDelay: `${i * 35}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-display text-lg font-semibold">{w.first_name} {w.last_name}</div>
                <div className={`mt-1 inline-flex items-center gap-1.5 text-sm ${open ? "text-live" : "text-muted"}`}>
                  <span className={`h-2 w-2 rounded-full ${open ? "animate-pulse bg-live" : "bg-border"}`} />
                  {open ? "Vahetuses" : "Vaba"}
                </div>
              </div>
              <Icon name="arrow" className="mt-1 h-5 w-5 shrink-0 text-muted" />
            </div>
            {open && <div className="mt-3 rounded-xl bg-bg px-3 py-2 text-sm"><span className="text-muted">Objekt</span><div className={`font-medium ${site ? "" : "text-alert"}`}>{site?.name ?? (fix?.nearest ? "Väljaspool tsooni" : "Objekt tuvastamata")}</div></div>}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
              <div><div className="text-xs text-muted">Tunnid sel nädalal</div><div className="tabular mt-0.5 font-semibold">{hours1(secs)} h</div></div>
              <div className="text-right"><div className="text-xs text-muted">Teenitud</div><div className="tabular mt-0.5 font-semibold text-signal">{rate != null ? money(weekEarned.get(w.id) ?? 0, w.currency) : "—"}</div></div>
            </div>
          </Link>;
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted">
            <tr>
              <th className="px-3 py-3 font-medium sm:px-4">Nimi</th>
              <th className="px-3 py-3 font-medium sm:px-4">Olek</th>
              <th className="px-3 py-3 font-medium sm:px-4">Objekt</th>
              <th className="px-3 py-3 text-right font-medium sm:px-4">Tunnid (nädal)</th>
              <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Tunnitasu</th>
              <th className="px-3 py-3 text-right font-medium sm:px-4">Teenitud</th>
              <th className="px-3 py-3 sm:px-4"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((w, i) => {
              const open = openBy.get(w.id);
              // Where is this punch? The database resolves it on insert (D-016);
              // shifts recorded before that are matched here by the same rule.
              const fix = open ? matchSite(open.start_lat, open.start_lng, siteList) : null;
              const site = open?.site_id ? siteById.get(open.site_id) ?? null : fix?.site ?? null;
              const outOfZone = open != null && site == null && fix?.nearest != null;
              const address = shortAddress(open?.start_address ?? null);
              const secs = weekSeconds.get(w.id) ?? 0;
              const rate = w.hourly_rate ?? w.self_hourly_rate ?? null;
              return (
                <tr
                  key={w.id}
                  className="rise border-b border-border last:border-0 hover:bg-bg"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <td className="px-3 py-3 sm:px-4">
                    <Link href={`/workers/${w.id}`} className="font-medium hover:text-signal">
                      {w.first_name} {w.last_name}
                    </Link>
                    {!w.is_active && <span className="ml-2 text-xs text-muted">(deaktiveeritud)</span>}
                  </td>
                  <td className="px-3 py-3 sm:px-4">
                    {open ? (
                      <span className="inline-flex items-center gap-1.5 text-signal">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-signal" /> Vahetuses
                      </span>
                    ) : (
                      <span className="text-muted">Vaba</span>
                    )}
                  </td>
                  <td className="px-3 py-3 sm:px-4">
                    {open ? (
                      <>
                        <div className={site ? "font-medium" : "font-medium text-alert"}>
                          {site ? site.name : fix?.nearest ? "Väljaspool tsooni" : "Objekt tuvastamata"}
                        </div>
                        <div className="text-xs text-muted">
                          {address ?? "aadress puudub"}
                          {outOfZone && fix?.nearest && (
                            <span className="text-alert">
                              {" "}
                              · {distanceLabel(fix.distance)} objektist {fix.nearest.name}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular sm:px-4">{hours1(secs)}</td>
                  <td className="hidden px-4 py-3 text-right text-muted sm:table-cell">
                    {w.hourly_rate != null ? money(w.hourly_rate, w.currency) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular font-semibold text-signal sm:px-4">
                    {rate != null ? money(weekEarned.get(w.id) ?? 0, w.currency) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right sm:px-4">
                    <DeleteWorker id={w.id} name={`${w.first_name} ${w.last_name}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
