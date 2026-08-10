import { supabaseServer } from "@/lib/supabase-server";
import { buildMatrix } from "@/lib/report";
import { hours1 } from "@/lib/format";
import type { ShiftReport } from "@/lib/types";
import { ExportButtons } from "@/components/ExportButtons";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const now = new Date();
  const defFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const fromStr = searchParams.from ?? defFrom;
  const toStr = searchParams.to ?? defTo;
  const from = new Date(fromStr + "T00:00:00Z");
  const to = new Date(toStr + "T00:00:00Z");
  to.setUTCDate(to.getUTCDate() + 1); // inclusive end day

  const supabase = supabaseServer();
  const [{ data: workers }, { data: shiftsRaw }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "worker").order("last_name"),
    supabase
      .from("v_shift_report")
      .select("*")
      .eq("status", "closed")
      .gte("started_at", from.toISOString())
      .lt("started_at", to.toISOString()),
  ]);

  const matrix = buildMatrix((shiftsRaw ?? []) as ShiftReport[], workers ?? [], from, to);
  const grandTotal = Object.values(matrix.totalsByWorker).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Aruanded</h1>
          <p className="mt-1 text-sm text-muted">Tööaeg perioodil, palgaarvestuseks.</p>
        </div>
        <ExportButtons from={fromStr} to={toStr} />
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
        <label className="text-sm">
          <span className="block text-muted">Alates</span>
          <input type="date" name="from" defaultValue={fromStr} className="mt-1 rounded-lg border border-border bg-bg px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block text-muted">Kuni</span>
          <input type="date" name="to" defaultValue={toStr} className="mt-1 rounded-lg border border-border bg-bg px-3 py-2" />
        </label>
        <button className="rounded-lg bg-text px-4 py-2 font-medium text-bg">Näita</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">Töötaja</th>
              {matrix.days.map((d) => (
                <th key={d} className="px-2 py-2 text-center font-medium">
                  {d.slice(8)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Kokku</th>
            </tr>
          </thead>
          <tbody>
            {matrix.workers.map((w) => (
              <tr key={w.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 bg-surface px-3 py-2 font-medium">
                  {w.name}
                  {matrix.flagsByWorker[w.id] > 0 && (
                    <span className="ml-2 text-xs text-alert">⚑{matrix.flagsByWorker[w.id]}</span>
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
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="sticky left-0 bg-surface px-3 py-2 font-semibold">Kokku</td>
              <td colSpan={matrix.days.length} />
              <td className="px-3 py-2 text-right tabular font-bold text-signal">{hours1(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">⚑ = kordi väljaspool objekti tsooni. Ületunde/öötööd siin ei arvestata.</p>
    </div>
  );
}
