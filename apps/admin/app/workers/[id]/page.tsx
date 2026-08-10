import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { hours1, hm, dmy, money, monthRange } from "@/lib/format";
import { WorkerAdmin } from "@/components/WorkerAdmin";
import { EditShift } from "@/components/EditShift";
import { MapView } from "@/components/MapView";
import { resolveEarnings } from "@/lib/report";
import type { ShiftReport } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkerCard({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { y?: string; m?: string };
}) {
  const supabase = supabaseServer();
  const now = new Date();
  const year = searchParams.y ? parseInt(searchParams.y) : now.getFullYear();
  const month = searchParams.m ? parseInt(searchParams.m) : now.getMonth();
  const { from, to } = monthRange(year, month);

  const [{ data: worker }, { data: sites }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", params.id).single(),
    supabase.from("sites").select("*"),
  ]);
  if (!worker) notFound();

  const { data: shiftsRaw } = await supabase
    .from("v_shift_report")
    .select("*")
    .eq("user_id", params.id)
    .gte("started_at", from)
    .lt("started_at", to)
    .order("started_at", { ascending: false });
  const shifts = (shiftsRaw ?? []) as ShiftReport[];

  const { data: edits } = await supabase
    .from("shift_edits")
    .select("*")
    .in("shift_id", shifts.map((s) => s.id).length ? shifts.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const totalSeconds = shifts.reduce((s, r) => s + (r.worked_seconds ?? 0), 0);
  const earn = resolveEarnings(totalSeconds, worker.hourly_rate, worker.self_hourly_rate);

  // per-day totals for the calendar
  const dayTotals = new Map<number, number>();
  for (const s of shifts) {
    const d = new Date(s.started_at).getDate();
    dayTotals.set(d, (dayTotals.get(d) ?? 0) + (s.worked_seconds ?? 0));
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0

  // GPS markers for the month
  const markers = shifts.flatMap((s) => {
    const m = [];
    if (s.start_lat != null && s.start_lng != null)
      m.push({ lat: s.start_lat, lng: s.start_lng, color: s.out_of_zone ? "#E2574C" : "#2FBF71", label: `${dmy(s.started_at)} algus` });
    if (s.end_lat != null && s.end_lng != null)
      m.push({ lat: s.end_lat, lng: s.end_lng, color: "#5A6B7C", label: `${dmy(s.started_at)} lõpp` });
    return m;
  });

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const monthLabel = new Date(year, month, 1).toLocaleDateString("et-EE", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← Töötajad
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">
            {worker.first_name} {worker.last_name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {worker.phone ?? "—"} · {worker.role} · {worker.is_active ? "aktiivne" : "deaktiveeritud"}
          </p>
        </div>
        <div className="text-right">
          <div className="tabular text-3xl font-semibold">{hours1(totalSeconds)} h</div>
          {earn.rate != null && (
            <div className="text-sm text-muted">
              {money(earn.amount, worker.currency)} · {earn.source === "company" ? "ettevõtte tunnitasu" : "isiklik hinnang"}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* left: calendar + shifts */}
        <div className="space-y-6 lg:col-span-2">
          {/* month switcher + calendar */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <Link href={`?y=${prev.getFullYear()}&m=${prev.getMonth()}`} className="rounded px-2 py-1 text-muted hover:text-text">
                ←
              </Link>
              <span className="font-display font-semibold capitalize">{monthLabel}</span>
              <Link href={`?y=${next.getFullYear()}&m=${next.getMonth()}`} className="rounded px-2 py-1 text-muted hover:text-text">
                →
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {["E", "T", "K", "N", "R", "L", "P"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`b${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const secs = dayTotals.get(day);
                return (
                  <div
                    key={day}
                    className={`aspect-square rounded-lg border p-1 ${
                      secs ? "border-signal/40 bg-signal/10" : "border-border"
                    }`}
                  >
                    <div className="text-[11px] text-muted">{day}</div>
                    {secs != null && <div className="tabular text-xs font-semibold text-text">{hours1(secs)}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* GPS map */}
          {markers.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface p-2">
              <MapView markers={markers} height={340} />
              <p className="px-3 py-2 text-xs text-muted">
                Roheline = algus objektil · Punane = algus väljaspool tsooni · Hall = lõpp
              </p>
            </div>
          )}

          {/* shift list */}
          <div className="space-y-2">
            {shifts.length === 0 && <p className="text-muted">Sel kuul vahetusi pole.</p>}
            {shifts.map((s, i) => {
              const shiftEdits = (edits ?? []).filter((e) => e.shift_id === s.id);
              return (
                <div
                  key={s.id}
                  className="rise rounded-2xl border border-border bg-surface p-4"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{dmy(s.started_at)}</div>
                      <div className="tabular text-sm text-muted">
                        {hm(s.started_at)} – {hm(s.ended_at)}
                        {s.break_seconds > 0 && <span> · paus {Math.round(s.break_seconds / 60)}m</span>}
                        <span> · {s.site_name ?? "objekt määramata"}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tabular text-lg font-semibold">{hours1(s.worked_seconds)} h</div>
                      <div className="flex items-center justify-end gap-2">
                        {s.status === "open" && <span className="text-xs text-signal">avatud</span>}
                        {s.is_stale && <span className="text-xs text-alert">aegunud</span>}
                        {s.out_of_zone && <span className="text-xs text-alert">väljaspool tsooni</span>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {s.start_address ?? "—"}
                      {s.source === "manual" && <span className="ml-2 italic">käsitsi korrigeeritud</span>}
                    </span>
                    <EditShift shift={{ id: s.id, started_at: s.started_at, ended_at: s.ended_at, break_seconds: s.break_seconds, status: s.status }} />
                  </div>

                  {shiftEdits.length > 0 && (
                    <div className="mt-2 border-t border-border pt-2 text-xs text-muted">
                      {shiftEdits.map((e) => (
                        <div key={e.id}>
                          {dmy(e.created_at)} {hm(e.created_at)} · {e.field}: {e.old_value ?? "∅"} → {e.new_value ?? "∅"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* right: admin */}
        <div className="space-y-6">
          <WorkerAdmin worker={worker} sites={sites ?? []} />
        </div>
      </div>
    </div>
  );
}
