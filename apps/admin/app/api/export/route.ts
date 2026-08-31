import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";
import { buildMatrix, buildWeekly, type WorkerRow } from "@/lib/report";
import { isFullWeek, isoWeek, isoWeekYear, parseYmd } from "@/lib/week";
import type { ShiftReport } from "@/lib/types";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Payroll export. Reads through the caller's session so RLS scopes it to the
// admin's own company. Produces a worker × day matrix with totals + rate + gross,
// plus a per-week block — pay runs weekly (D-015), so that is the payable table.
export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  if (profile.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "xlsx") {
    return new NextResponse("Unsupported export format", { status: 400 });
  }
  const fromStr = req.nextUrl.searchParams.get("from") ?? "";
  const toStr = req.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return new NextResponse("Invalid date range", { status: 400 });
  }
  const from = parseYmd(fromStr);
  const to = parseYmd(toStr);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) {
    return new NextResponse("Invalid date range", { status: 400 });
  }
  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxRangeMs) {
    return new NextResponse("Export range is limited to 366 days", { status: 400 });
  }
  to.setUTCDate(to.getUTCDate() + 1);

  const supabase = await supabaseServer();
  const [workersResult, shiftsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "worker").order("last_name"),
    supabase
      .from("v_shift_report")
      .select("*")
      .eq("status", "closed")
      .gte("started_at", from.toISOString())
      .lt("started_at", to.toISOString()),
  ]);
  if (workersResult.error || shiftsResult.error) {
    console.error("Payroll export query failed", {
      workers: workersResult.error?.message,
      shifts: shiftsResult.error?.message,
    });
    return new NextResponse("Could not load export data", { status: 500 });
  }

  const workerRows = (workersResult.data ?? []) as WorkerRow[];
  const matrix = buildMatrix((shiftsResult.data ?? []) as ShiftReport[], workerRows, from, to);
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

  const { error: auditError } = await supabaseService().from("audit_logs").insert({
    company_id: profile.company_id,
    actor_id: profile.id,
    action: "payroll.exported",
    target_type: "company",
    target_id: profile.company_id,
    metadata: { format, from: fromStr, to: toStr },
  });
  if (auditError) return new NextResponse("Could not record export audit event", { status: 500 });

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Nädalad").addRows([weekHeader, ...weekRows, weekTotals]);
    workbook.addWorksheet("Päevad").addRows([header, ...rows]);
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // CSV (semicolon-separated + BOM so Excel/ET locale opens it cleanly)
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    // Prevent spreadsheet formula execution when a user-controlled name is
    // opened in Excel/LibreOffice.
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
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
      "Cache-Control": "private, no-store",
    },
  });
}
