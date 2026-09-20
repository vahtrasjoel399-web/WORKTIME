import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { buildMatrix, buildWeekly, type WorkerRow } from "@/lib/report";
import { hours1, money } from "@/lib/format";
import { addWeeks, isFullWeek, isoWeek, parseYmd, startOfWeek, weekRange, ymd } from "@/lib/week";
import type { ShiftReport } from "@/lib/types";
import { ExportButtons } from "@/components/ExportButtons";
import { pricingUnit, PRICING_LABELS } from "@/lib/pricing";
import { EmptyState, MetricStrip, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const DOW = ["E", "T", "K", "N", "R", "L", "P"];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const query = await searchParams;
  // Pay runs weekly (D-015), so the period defaults to the running week and the
  // page rolls over to the next one by itself every Monday.
  const thisWeek = weekRange(new Date());
  const fromStr = query.from ?? thisWeek.from;
  const toStr = query.to ?? thisWeek.to;
  const from = parseYmd(fromStr);
  const to = parseYmd(toStr);
  to.setUTCDate(to.getUTCDate() + 1); // inclusive end day

  const supabase = await supabaseServer();
  const [{ data: workers }, { data: shiftsRaw }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "worker").order("last_name"),
    supabase
      .from("v_shift_report")
      .select("*")
      .eq("status", "closed")
      .gte("started_at", from.toISOString())
      .lt("started_at", to.toISOString()),
  ]);

  const workerRows = (workers ?? []) as WorkerRow[];
  const matrix = buildMatrix((shiftsRaw ?? []) as ShiftReport[], workerRows, from, to);
  const grandTotal = Object.values(matrix.totalsByWorker).reduce((a, b) => a + b, 0);
  const grandEarned = Object.values(matrix.earningsByWorker).reduce((a, b) => a + b, 0);
  const currency = matrix.workers[0]?.currency ?? "EUR";

  const weekly = buildWeekly(matrix, workerRows);
  const oneWeek = isFullWeek(from, to);
  const multiWeek = weekly.weeks.length > 1;

  const prev = weekRange(addWeeks(from, -1));
  const next = weekRange(addWeeks(from, 1));
  const href = (r: { from: string; to: string }) => `/reports?from=${r.from}&to=${r.to}`;
  const isCurrent = fromStr === thisWeek.from && toStr === thisWeek.to;

  const period = oneWeek
    ? `${isCurrent ? "Käesolev nädal" : "Nädal"} ${isoWeek(from)} · ${fmt(fromStr)} – ${fmt(toStr)}`
    : `${fmt(fromStr)} – ${fmt(toStr)}`;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Palgaarvestus" title="Tööaruanne" description={period} actions={<ExportButtons from={fromStr} to={toStr} />} />

      {/* week navigation — one click per pay period */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(prev)} className="btn-secondary">
          ← Eelmine nädal
        </Link>
        <Link
          href={href(thisWeek)}
          className={`btn ${
            isCurrent ? "bg-primary text-primary-foreground" : "border border-border-strong bg-surface hover:bg-bg"
          }`}
        >
          See nädal
        </Link>
        <Link href={href(next)} className="btn-secondary">
          Järgmine nädal →
        </Link>
        <Link
          href={href({ from: ymd(startOfWeek(addWeeks(new Date(), -3))), to: thisWeek.to })}
          className="btn-quiet"
        >
          Viimased 4 nädalat
        </Link>
      </div>

      {/* summary */}
      <MetricStrip items={[
        { label: "Tunnid perioodis", value: `${hours1(grandTotal)} h`, detail: period },
        { label: "Palgafond", value: money(grandEarned, currency), detail: "Bruto, hinnanguline", tone: "signal" },
        { label: "Töötajaid tööajaga", value: matrix.workers.filter((w) => matrix.totalsByWorker[w.id] > 0).length, detail: `${matrix.workers.length} töötajat kokku` },
      ]} />

      <form className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">
          <span className="field-label">Alates</span>
          <input type="date" name="from" defaultValue={fromStr} className="control bg-bg" />
        </label>
        <label className="text-sm">
          <span className="field-label">Kuni</span>
          <input type="date" name="to" defaultValue={toStr} className="control bg-bg" />
        </label>
        <button className="btn-primary">Näita perioodi</button>
      </form>

      {matrix.workers.length === 0 ? <EmptyState title="Aruandes pole töötajaid" description="Valitud perioodi kohta ei ole kuvamiseks töötajaid ega tööaega." /> : <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">Töötaja</th>
              {matrix.days.map((d) => {
                const dow = DOW[(parseYmd(d).getUTCDay() + 6) % 7];
                const weekend = dow === "L" || dow === "P";
                return (
                  <th key={d} className={`px-2 py-2 text-center font-medium ${weekend ? "text-alert/70" : ""}`}>
                    {oneWeek ? <span className="block text-[11px]">{dow}</span> : null}
                    {d.slice(8)}
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right font-medium">Kokku</th>
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Hind</th>
              <th className="px-3 py-2 text-right font-medium">Teenitud</th>
            </tr>
          </thead>
          <tbody>
            {matrix.workers.map((w) => (
              <tr key={w.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 bg-surface px-3 py-2 font-medium">
                  <Link href={`/workers/${w.id}`} className="hover:text-signal">
                    {w.name}
                  </Link>
                  {matrix.flagsByWorker[w.id] > 0 && (
                    <span className="ml-2"><StatusBadge tone="alert">Väljaspool tsooni · {matrix.flagsByWorker[w.id]}</StatusBadge></span>
                  )}
                </td>
                {matrix.days.map((d) => {
                  const h = matrix.hours[w.id]?.[d];
                  return (
                    <td key={d} className={`px-2 py-2 text-center tabular ${h ? "text-text" : "text-muted"}`}>
                      {h ? h.toFixed(1) : "·"}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right tabular font-semibold">
                  {hours1(matrix.totalsByWorker[w.id])}
                </td>
                <td className="hidden px-3 py-2 text-right tabular text-muted sm:table-cell">
                  <div>{w.rate != null ? `${w.rate.toFixed(2)} €/${pricingUnit(w.pricingType, w.unit)}` : "—"}</div>
                  <div className="text-[10px]">{PRICING_LABELS[w.pricingType]}</div>
                </td>
                <td className="px-3 py-2 text-right tabular font-semibold text-signal">
                  {w.rate != null ? money(matrix.earningsByWorker[w.id], w.currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="sticky left-0 bg-surface px-3 py-2 font-semibold">Kokku</td>
              <td colSpan={matrix.days.length} />
              <td className="px-3 py-2 text-right tabular font-bold">{hours1(grandTotal)}</td>
              <td className="hidden sm:table-cell" />
              <td className="px-3 py-2 text-right tabular font-bold text-signal">{money(grandEarned, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>}

      {/* when the period spans several weeks, show what each pay week owes */}
      {multiWeek && (
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold">Nädalate kaupa</h2>
          <div className="panel overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">Töötaja</th>
                  {weekly.weeks.map((wk) => (
                    <th key={wk.key} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      <Link href={href(weekRange(parseYmd(wk.from)))} className="hover:text-signal">
                        {wk.label}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.workers.map((w) => (
                  <tr key={w.id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 bg-surface px-3 py-2 font-medium">{w.name}</td>
                    {weekly.weeks.map((wk) => {
                      const secs = weekly.seconds[w.id]?.[wk.key] ?? 0;
                      return (
                        <td key={wk.key} className="px-3 py-2 text-right">
                          <div className={`tabular ${secs ? "font-semibold" : "text-muted"}`}>
                            {secs ? `${hours1(secs)} h` : "·"}
                          </div>
                          {secs > 0 && w.rate != null && (
                            <div className="tabular text-xs text-signal">
                              {money(weekly.earnings[w.id]?.[wk.key] ?? 0, w.currency)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="sticky left-0 bg-surface px-3 py-2 font-semibold">Nädala palgafond</td>
                  {weekly.weeks.map((wk) => (
                    <td key={wk.key} className="px-3 py-2 text-right">
                      <div className="tabular font-bold">{hours1(weekly.totalsByWeek[wk.key])} h</div>
                      <div className="tabular text-xs font-semibold text-signal">
                        {money(weekly.earningsByWeek[wk.key], currency)}
                      </div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted">
        Väljaspool tsooni = kordi, mil töö algus märgiti objekti alast eemal. Summad on bruto ja orienteeruvad (tunnid × hind või tehtud kogus × hind) —
        ületunde, öötööd ega makse siin ei arvestata.
      </p>
    </div>
  );
}

function fmt(ymdStr: string): string {
  const [y, m, d] = ymdStr.split("-");
  return `${d}.${m}.${y}`;
}
