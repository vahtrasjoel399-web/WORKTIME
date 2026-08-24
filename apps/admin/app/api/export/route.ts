import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabase-server";
import { buildMatrix, buildWeekly, type WorkerRow } from "@/lib/report";
import { isFullWeek, isoWeek, isoWeekYear, parseYmd } from "@/lib/week";
import type { ShiftReport } from "@/lib/types";

export const dynamic = "force-dynamic";

// Payroll export. Reads through the caller's session so RLS scopes it to the
// admin's own company. Produces a worker × day matrix with totals + rate + gross,
// plus a per-week block — pay runs weekly (D-015), so that is the payable table.
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const fromStr = req.nextUrl.searchParams.get("from")!;
  const toStr = req.nextUrl.searchParams.get("to")!;
  const from = parseYmd(fromStr);
  const to = parseYmd(toStr);
  to.setUTCDate(to.getUTCDate() + 1);

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

  const workerRows = (workers ?? []) as WorkerRow[];
  const matrix = buildMatrix((shiftsRaw ?? []) as ShiftReport[], workerRows, from, to);
  const weekly = buildWeekly(matrix, workerRows);

  // rows: worker, [day...], total hours, rate, gross, out-of-zone flags
  const header = ["Töötaja", ...matrix.days, "Tunnid kokku", "Tunnitasu", "Bruto (orient.)", "Väljaspool tsooni"];
  const rows = matrix.workers.map((w) => {
    const totalH = matrix.totalsByWorker[w.id] / 3600;
    const gross = w.rate != null ? totalH * w.rate : null;
    return [
      w.name,
      ...matrix.days.map((d) => {
        const h = matrix.hours[w.id]?.[d];
        return h ? Number(h.toFixed(2)) : "";
      }),
      Number(totalH.toFixed(2)),
      w.rate ?? "",
      gross != null ? Number(gross.toFixed(2)) : "",
      matrix.flagsByWorker[w.id] || "",
    ];
  });

  // per-week sheet: hours and gross side by side for every pay week in the range
  const weekHeader = [
    "Töötaja",
    "Tunnitasu",
    ...weekly.weeks.flatMap((w) => [`${w.label} h`, `${w.label} €`]),
    "Tunnid kokku",
    "Bruto kokku",
  ];
  const weekRows = matrix.workers.map((w) => [
    w.name,
    w.rate ?? "",
    ...weekly.weeks.flatMap((wk) => {
      const secs = weekly.seconds[w.id]?.[wk.key] ?? 0;
      const amt = weekly.earnings[w.id]?.[wk.key] ?? 0;
      return [secs ? Number((secs / 3600).toFixed(2)) : "", secs && w.rate != null ? Number(amt.toFixed(2)) : ""];
    }),
    Number((matrix.totalsByWorker[w.id] / 3600).toFixed(2)),
    w.rate != null ? Number(matrix.earningsByWorker[w.id].toFixed(2)) : "",
  ]);
  const weekTotals = [
    "KOKKU",
    "",
    ...weekly.weeks.flatMap((wk) => [
      Number((weekly.totalsByWeek[wk.key] / 3600).toFixed(2)),
      Number(weekly.earningsByWeek[wk.key].toFixed(2)),
    ]),
    Number((Object.values(matrix.totalsByWorker).reduce((a, b) => a + b, 0) / 3600).toFixed(2)),
    Number(Object.values(matrix.earningsByWorker).reduce((a, b) => a + b, 0).toFixed(2)),
  ];

  // A single-week export is named by its ISO week — that is how pay runs are filed.
  const filename = isFullWeek(from, to)
    ? `tooaeg_${isoWeekYear(from)}-N${String(isoWeek(from)).padStart(2, "0")}_${fromStr}_${toStr}`
    : `tooaeg_${fromStr}_${toStr}`;

  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([weekHeader, ...weekRows, weekTotals]), "Nädalad");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Päevad");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  // CSV (semicolon-separated + BOM so Excel/ET locale opens it cleanly)
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const block = (aoa: unknown[][]) => aoa.map((r) => r.map(esc).join(";")).join("\r\n");
  const csv =
    "﻿" +
    block([["NÄDALAD"], weekHeader, ...weekRows, weekTotals]) +
    "\r\n\r\n" +
    block([["PÄEVAD"], header, ...rows]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
