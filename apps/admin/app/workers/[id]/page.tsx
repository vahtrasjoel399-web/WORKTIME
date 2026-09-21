import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { hours1, hm, dmy, money, monthRange } from "@/lib/format";
import { WorkerAdmin } from "@/components/WorkerAdmin";
import { EmployeeProfileEditor } from "@/components/EmployeeProfileEditor";
import { EmployeeDocuments } from "@/components/EmployeeDocuments";
import { EmployeeAssignmentManager } from "@/components/EmployeeAssignmentManager";
import { EditShift } from "@/components/EditShift";
import { AddShift } from "@/components/AddShift";
import { MapView } from "@/components/MapView";
import { pricingUnit, PRICING_LABELS, shiftTotal } from "@/lib/pricing";
import type { EmployeeAssignment, EmployeeDocument, Profile, ShiftReport, Site } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WorkerCard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect(me.role === "accountant" ? "/reports" : "/me");

  const supabase = await supabaseServer();
  const now = new Date();
  const year = query.y ? parseInt(query.y) : now.getFullYear();
  const month = query.m ? parseInt(query.m) : now.getMonth();
  const { from, to } = monthRange(year, month);

  const [
    { data: workerRaw },
    { data: sitesRaw },
    { data: assignmentsRaw },
    { data: documentsRaw },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).eq("role", "worker").single(),
    supabase.from("sites").select("*"),
    supabase
      .from("employee_assignments")
      .select("*")
      .eq("employee_id", id)
      .order("start_date", { ascending: false }),
    supabase
      .from("employee_documents")
      .select("*")
      .eq("employee_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!workerRaw) notFound();
  const worker = workerRaw as Profile;
  const sites = (sitesRaw ?? []) as Site[];
  const assignments = (assignmentsRaw ?? []) as EmployeeAssignment[];
  const documents = (documentsRaw ?? []) as EmployeeDocument[];

  const filePaths = [
    ...(worker.profile_photo_path ? [worker.profile_photo_path] : []),
    ...documents.map((document) => document.storage_path),
  ];
  const signedByPath = new Map<string, string>();
  if (filePaths.length > 0) {
    const { data: signedFiles } = await supabase.storage
      .from("employee-files")
      .createSignedUrls(filePaths, 3600);
    for (const signedFile of signedFiles ?? []) {
      if (signedFile.path && signedFile.signedUrl) signedByPath.set(signedFile.path, signedFile.signedUrl);
    }
  }
  const photoUrl = worker.profile_photo_path ? signedByPath.get(worker.profile_photo_path) ?? null : null;
  const documentsWithUrls = documents.map((document) => ({
    ...document,
    signed_url: signedByPath.get(document.storage_path) ?? null,
  }));

  const siteById = new Map(sites.map((site) => [site.id, site]));
  const currentAssignment = assignments.find((assignment) => assignment.end_date == null) ?? null;
  const currentSiteId = currentAssignment?.site_id ?? worker.default_site_id ?? null;
  const currentSite = currentSiteId ? siteById.get(currentSiteId) ?? null : null;

  const { data: shiftsRaw } = await supabase
    .from("v_shift_report")
    .select("*")
    .eq("user_id", id)
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
  const fallbackRate = worker.pricing_type === "hourly" ? worker.hourly_rate ?? worker.self_hourly_rate : worker.hourly_rate;
  const totalEarned = shifts.reduce((sum, shift) => sum + shiftTotal(shift, fallbackRate), 0);

  // per-day totals for the calendar
  const dayTotals = new Map<number, number>();
  const dayEarnings = new Map<number, number>();
  for (const s of shifts) {
    const d = new Date(s.started_at).getDate();
    dayTotals.set(d, (dayTotals.get(d) ?? 0) + (s.worked_seconds ?? 0));
    dayEarnings.set(d, (dayEarnings.get(d) ?? 0) + shiftTotal(s, fallbackRate));
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0

  // Pay runs weekly (D-015), so the calendar carries a per-week subtotal column.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const calendarWeeks = Array.from({ length: cells.length / 7 }, (_, r) => {
    const row = cells.slice(r * 7, r * 7 + 7);
    const seconds = row.reduce((a: number, day) => a + (day != null ? dayTotals.get(day) ?? 0 : 0), 0);
    const earned = row.reduce((sum: number, day) => sum + (day != null ? dayEarnings.get(day) ?? 0 : 0), 0);
    return { row, seconds, earned };
  });

  // GPS markers for the month
  const markers = shifts.flatMap((s) => {
    const m = [];
    if (s.start_lat != null && s.start_lng != null)
      m.push({ lat: s.start_lat, lng: s.start_lng, color: s.out_of_zone ? "#E2574C" : "#2FBF71", label: `${dmy(s.started_at)} · algus ${hm(s.started_at)}` });
    if (s.end_lat != null && s.end_lng != null)
      m.push({ lat: s.end_lat, lng: s.end_lng, color: "#5A6B7C", label: `${dmy(s.started_at)} · lõpp ${hm(s.ended_at)}` });
    return m;
  });

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const monthLabel = new Date(year, month, 1).toLocaleDateString("et-EE", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm font-medium text-muted hover:text-primary">
        ← Töötajad
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {photoUrl ? (
            <img src={photoUrl} alt={`${worker.first_name} ${worker.last_name}`} className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover sm:h-20 sm:w-20" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-surface font-display text-xl font-bold text-muted sm:h-20 sm:w-20">
              {`${worker.first_name.charAt(0)}${worker.last_name.charAt(0)}`.toUpperCase() || "?"}
            </span>
          )}
          <div className="min-w-0">
          <h1 className="page-title truncate">
            {worker.first_name} {worker.last_name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted"><span>{worker.position ?? "Amet määramata"}</span><StatusBadge tone={worker.is_active ? "live" : "neutral"}>{worker.is_active ? "Aktiivne" : "Mitteaktiivne"}</StatusBadge></div>
          <p className="mt-1 truncate text-sm text-muted">{worker.email ?? "e-post puudub"} · {worker.phone ?? "telefon puudub"}</p>
          </div>
        </div>
        <div className="panel min-w-44 px-4 py-3 text-left sm:text-right">
          <div className="text-xs font-medium text-muted">Kuu tööaeg</div>
          <div className="tabular text-2xl font-semibold">{hours1(totalSeconds)} h</div>
          {totalEarned > 0 && (
            <div className="text-sm text-muted">
              {money(totalEarned, worker.currency)} · segahinnastusega töö
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* left: calendar + shifts */}
        <div className="space-y-6 lg:col-span-2">
          {/* month switcher + calendar */}
          <div className="panel-pad">
            <div className="mb-4 flex items-center justify-between">
              <Link href={`?y=${prev.getFullYear()}&m=${prev.getMonth()}`} className="rounded px-2 py-1 text-muted hover:text-text">
                ←
              </Link>
              <span className="font-display font-semibold capitalize">{monthLabel}</span>
              <Link href={`?y=${next.getFullYear()}&m=${next.getMonth()}`} className="rounded px-2 py-1 text-muted hover:text-text">
                →
              </Link>
            </div>
            <div className="grid grid-cols-8 gap-1 text-center text-xs text-muted">
              {["E", "T", "K", "N", "R", "L", "P"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
              <div className="py-1 font-semibold text-signal">nädal</div>
              {calendarWeeks.map((wk, r) => (
                <Fragment key={r}>
                  {wk.row.map((day, c) =>
                    day == null ? (
                      <div key={`b${r}-${c}`} />
                    ) : (
                      <div
                        key={day}
                        className={`aspect-square rounded-lg border p-1 ${
                          dayTotals.get(day) ? "border-signal/40 bg-signal/10" : "border-border"
                        }`}
                      >
                        <div className="text-[11px] text-muted">{day}</div>
                        {dayTotals.get(day) != null && (
                          <div className="tabular text-xs font-semibold text-text">{hours1(dayTotals.get(day)!)}</div>
                        )}
                      </div>
                    ),
                  )}
                  <div className={`aspect-square rounded-lg border p-1 ${wk.seconds ? "border-signal bg-signal/15" : "border-border"}`}>
                    <div className="tabular text-xs font-semibold text-text">{wk.seconds ? hours1(wk.seconds) : "·"}</div>
                    {wk.earned > 0 && (
                      <div className="tabular text-[10px] font-semibold text-signal">
                        {money(wk.earned, worker.currency)}
                      </div>
                    )}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>

          {/* GPS map */}
          {markers.length > 0 && (
            <div className="panel overflow-hidden p-2">
              <MapView markers={markers} height={340} />
              <p className="px-3 py-2 text-xs text-muted">
                Roheline = algus objektil · Punane = algus väljaspool tsooni · Hall = lõpp
              </p>
            </div>
          )}

          {/* shift list */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">Vahetused</h3>
              <AddShift
                userId={worker.id}
                companyId={worker.company_id}
                workerName={`${worker.first_name} ${worker.last_name}`}
                defaultPricingType={worker.pricing_type ?? "hourly"}
                defaultRate={worker.hourly_rate ?? (worker.pricing_type === "hourly" ? worker.self_hourly_rate : null)}
                defaultUnit={worker.pricing_unit}
                currency={worker.currency}
              />
            </div>
            {shifts.length === 0 && <p className="text-muted">Sel kuul vahetusi pole.</p>}
            {shifts.map((s, i) => {
              const shiftEdits = (edits ?? []).filter((e) => e.shift_id === s.id);
              return (
                <div
                  key={s.id}
                  className="rise panel p-4"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-medium">{dmy(s.started_at)}</div>
                      <div className="tabular text-sm text-muted">
                        {hm(s.started_at)} – {hm(s.ended_at)}
                        {s.break_seconds > 0 && <span> · paus {Math.round(s.break_seconds / 60)}m</span>}
                        <span> · {s.site_name ?? "objekt määramata"}</span>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <div className="tabular text-lg font-semibold">{hours1(s.worked_seconds)} h</div>
                      <div className="tabular text-sm font-semibold text-signal">{money(shiftTotal(s, fallbackRate), worker.currency)}</div>
                      <div className="text-xs text-muted">
                        {PRICING_LABELS[s.pricing_type ?? "hourly"]} · {s.pricing_rate?.toFixed(2) ?? "—"} €/{pricingUnit(s.pricing_type ?? "hourly", s.unit)}
                        {(s.pricing_type ?? "hourly") !== "hourly" && s.quantity != null ? ` · ${s.quantity} ${s.unit}` : ""}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:justify-end">
                        {s.source === "manual" && <StatusBadge>Käsitsi</StatusBadge>}
                        {s.status === "open" && <StatusBadge tone="primary">Avatud</StatusBadge>}
                        {s.is_stale && <StatusBadge tone="alert">Aegunud</StatusBadge>}
                        {s.out_of_zone && <StatusBadge tone="alert">Väljaspool tsooni</StatusBadge>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 text-xs text-muted">
                      <span className="flex items-start gap-1.5"><Icon name="location" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-live" /><span className="break-words">{s.start_address ?? "Algusaadress puudub"}</span></span>
                      {s.end_address ? <span className="mt-1 flex items-start gap-1.5"><Icon name="location" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" /><span className="break-words">{s.end_address}</span></span> : null}
                    </span>
                    <EditShift shift={{ id: s.id, started_at: s.started_at, ended_at: s.ended_at, break_seconds: s.break_seconds, status: s.status, pricing_type: s.pricing_type, pricing_rate: s.pricing_rate, quantity: s.quantity, unit: s.unit }} />
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
          <EmployeeProfileEditor worker={worker} photoUrl={photoUrl} />

          <section className="panel-pad space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Tööinfo</h3>
              <p className="mt-1 text-sm text-muted">Praegune objekt ja määramiste ajalugu</p>
            </div>
            <div className="rounded-xl bg-bg p-3">
              <div className="text-xs text-muted">Praegune objekt</div>
              <div className="mt-1 font-medium">{currentSite?.name ?? "Määramata"}</div>
              {currentSite?.address && <div className="mt-0.5 text-xs text-muted">{currentSite.address}</div>}
            </div>
            <EmployeeAssignmentManager employeeId={worker.id} currentAssignment={currentAssignment} sites={sites} />
            <div className="space-y-2">
              {assignments.length === 0 && <p className="text-sm text-muted">Määramiste ajalugu puudub.</p>}
              {assignments.map((assignment) => {
                const site = siteById.get(assignment.site_id);
                return (
                  <div key={assignment.id} className="flex items-start justify-between gap-3 border-l-2 border-border pl-3 text-sm">
                    <div>
                      <div className="font-medium">{site?.name ?? "Tundmatu objekt"}</div>
                      <div className="text-xs text-muted">
                        {new Date(`${assignment.start_date}T00:00:00`).toLocaleDateString("et-EE")} → {assignment.end_date ? new Date(`${assignment.end_date}T00:00:00`).toLocaleDateString("et-EE") : "praeguseni"}
                      </div>
                    </div>
                    {!assignment.end_date && <span className="rounded-full bg-live/10 px-2 py-0.5 text-[10px] text-live">Praegune</span>}
                  </div>
                );
              })}
            </div>
          </section>

          <EmployeeDocuments worker={worker} actorId={me.id} documents={documentsWithUrls} />
          <WorkerAdmin worker={worker} />
        </div>
      </div>
    </div>
  );
}
