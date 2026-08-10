import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { hours1, money } from "@/lib/format";
import { AddWorker } from "@/components/AddWorker";
import { PendingWorkers } from "@/components/PendingWorkers";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const supabase = supabaseServer();
  const now = new Date();
  const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
  const to = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString();

  const [{ data: workers }, { data: openShifts }, { data: monthShifts }, { data: sites }, { data: company }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("role", "worker").order("last_name"),
      supabase.from("shifts").select("user_id, site_id, started_at").eq("status", "open"),
      supabase
        .from("shifts")
        .select("user_id, worked_seconds")
        .eq("status", "closed")
        .gte("started_at", from)
        .lt("started_at", to),
      supabase.from("sites").select("id, name"),
      supabase.from("companies").select("name, join_code").limit(1).maybeSingle(),
    ]);

  const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const openBy = new Map((openShifts ?? []).map((o) => [o.user_id, o]));
  const monthSeconds = new Map<string, number>();
  for (const s of monthShifts ?? []) {
    monthSeconds.set(s.user_id, (monthSeconds.get(s.user_id) ?? 0) + (s.worked_seconds ?? 0));
  }

  const all = (workers ?? []) as Profile[];
  const pending = all.filter((w) => !w.is_approved);
  const list = all.filter((w) => w.is_approved);
  const onShift = list.filter((w) => openBy.has(w.id)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Töötajad</h1>
          <p className="mt-1 text-sm text-muted">
            {list.length} töötajat · <span className="text-live">{onShift} vahetuses</span>
          </p>
          {company?.join_code && (
            <p className="mt-2 text-sm text-muted">
              Ettevõtte kood töötajatele:{" "}
              <span className="tabular font-semibold tracking-widest text-signal">{company.join_code}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/reports"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-signal"
          >
            Ava aruanded →
          </Link>
          <AddWorker />
        </div>
      </div>

      <PendingWorkers pending={pending} />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nimi</th>
              <th className="px-4 py-3 font-medium">Olek</th>
              <th className="px-4 py-3 font-medium">Objekt</th>
              <th className="px-4 py-3 text-right font-medium">Tunnid (kuu)</th>
              <th className="px-4 py-3 text-right font-medium">Tunnitasu</th>
            </tr>
          </thead>
          <tbody>
            {list.map((w, i) => {
              const open = openBy.get(w.id);
              const secs = monthSeconds.get(w.id) ?? 0;
              return (
                <tr
                  key={w.id}
                  className="rise border-b border-border last:border-0 hover:bg-bg"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <td className="px-4 py-3">
                    <Link href={`/workers/${w.id}`} className="font-medium hover:text-signal">
                      {w.first_name} {w.last_name}
                    </Link>
                    {!w.is_active && <span className="ml-2 text-xs text-muted">(deaktiveeritud)</span>}
                  </td>
                  <td className="px-4 py-3">
                    {open ? (
                      <span className="inline-flex items-center gap-1.5 text-signal">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-signal" /> Vahetuses
                      </span>
                    ) : (
                      <span className="text-muted">Vaba</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {open?.site_id ? siteName.get(open.site_id) ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular">{hours1(secs)}</td>
                  <td className="px-4 py-3 text-right text-muted">
                    {w.hourly_rate != null ? money(w.hourly_rate, w.currency) : "—"}
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
