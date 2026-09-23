import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";
import { buildMatrix, buildWeekly, type WorkerRow } from "@/lib/report";
import { isFullWeek, isoWeek, isoWeekYear, parseYmd } from "@/lib/week";
import type { ShiftReport } from "@/lib/types";
import { getProfile } from "@/lib/auth";
import { clientShiftTotal, pricingUnit, PRICING_LABELS, shiftTotal } from "@/lib/pricing";
import { summarizeClientInvoice, type ReportShift } from "@/lib/report-summary";

export const dynamic = "force-dynamic";

// Payroll export. Reads through the caller's session so RLS scopes it to the
// admin's own company. Produces a worker × day matrix with totals + rate + gross,
// plus a per-week block — pay runs weekly (D-015), so that is the payable table.
export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return new NextResponse("Unauthorized", { status: 401 });
  if (profile.role === "worker") return new NextResponse("Forbidden", { status: 403 });

  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "xlsx") {
    return new NextResponse("Unsupported export format", { status: 400 });
  }
  const fromStr = req.nextUrl.searchParams.get("from") ?? "";
  const toStr = req.nextUrl.searchParams.get("to") ?? "";
  const workerId = req.nextUrl.searchParams.get("worker") ?? "";
  const siteId = req.nextUrl.searchParams.get("site") ?? "";
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
  const db = profile.role === "accountant" ? supabaseService() : supabase;
  let workersQuery = db.from("profiles").select("id, first_name, last_name, hourly_rate, self_hourly_rate, pricing_type, pricing_unit, currency").eq("company_id", profile.company_id).eq("role", "worker").order("last_name");
  if (workerId) workersQuery = workersQuery.eq("id", workerId);
  let shiftsQuery = db
      .from("v_shift_report")
      .select("id, user_id, site_id, site_name, started_at, ended_at, worked_seconds, pricing_type, pricing_rate, pricing_label, quantity, unit, calculated_total, is_net, client_rate_id, client_pricing_rate, client_calculated_total, work_date, out_of_zone")
      .eq("company_id", profile.company_id)
      .eq("status", "closed")
      .gte("started_at", from.toISOString())
      .lt("started_at", to.toISOString());
  if (workerId) shiftsQuery = shiftsQuery.eq("user_id", workerId);
  if (siteId) shiftsQuery = shiftsQuery.eq("site_id", siteId);
  let adjustmentsQuery = db.from("monthly_adjustments")
    .select("id, employee_id, site_id, period_month, amount, currency, is_net, note")
    .eq("company_id", profile.company_id)
    .gte("period_month", fromStr.slice(0, 7) + "-01")
    .lte("period_month", toStr.slice(0, 7) + "-01");
  if (workerId) adjustmentsQuery = adjustmentsQuery.eq("employee_id", workerId);
  if (siteId) adjustmentsQuery = adjustmentsQuery.eq("site_id", siteId);
  const [workersResult, shiftsResult, sitesResult, adjustmentsResult] = await Promise.all([
    workersQuery,
    shiftsQuery,
    db.from("sites").select("id, name, address, client_name").eq("company_id", profile.company_id),
    adjustmentsQuery,
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
  const nameByWorker = new Map(matrix.workers.map((worker) => [worker.id, worker.name]));
  const siteById = new Map((sitesResult.data ?? []).map((site) => [site.id, site]));
  const detailHeader = ["Töötaja", "Kuupäev", "Objekt", "Aadress", "Töö liik", "Kogus", "Ühik", "Töötaja hind", "Töötunnid", "Töötaja bruto", "Töötaja neto", "Kliendi hind", "Kliendi summa"];
  const detailRows: unknown[][] = ((shiftsResult.data ?? []) as ShiftReport[]).map((shift) => {
    const site = shift.site_id ? siteById.get(shift.site_id) : null;
    const total = shiftTotal(shift);
    return [
      nameByWorker.get(shift.user_id) ?? "—", shift.work_date, shift.site_name ?? "Objekt määramata", site?.address ?? "",
      shift.pricing_label ?? PRICING_LABELS[shift.pricing_type], shift.pricing_type === "hourly" ? Number(((shift.worked_seconds ?? 0) / 3600).toFixed(2)) : shift.quantity ?? "",
      pricingUnit(shift.pricing_type, shift.unit), shift.pricing_rate ?? "", Number(((shift.worked_seconds ?? 0) / 3600).toFixed(2)),
      shift.is_net === false ? Number(total.toFixed(2)) : "", shift.is_net === false ? "" : Number(total.toFixed(2)),
      shift.client_pricing_rate ?? "", clientShiftTotal(shift) ?? "",
    ];
  });
  for (const adjustment of adjustmentsResult.data ?? []) {
    const site = adjustment.site_id ? siteById.get(adjustment.site_id) : null;
    detailRows.push([
      nameByWorker.get(adjustment.employee_id) ?? "—", adjustment.period_month, site?.name ?? "", site?.address ?? "",
      `Kuu lisasumma: ${adjustment.note}`, "", "", "", "",
      adjustment.is_net === false ? Number(adjustment.amount) : "", adjustment.is_net === false ? "" : Number(adjustment.amount), "", "",
    ]);
  }

  const invoiceShifts: ReportShift[] = ((shiftsResult.data ?? []) as ShiftReport[]).map((shift) => ({
    ...shift,
    site_address: shift.site_id ? siteById.get(shift.site_id)?.address ?? null : null,
    site_client_name: shift.site_id ? siteById.get(shift.site_id)?.client_name ?? null : null,
  }));
  const invoiceSummary = summarizeClientInvoice(invoiceShifts);
  const invoiceHeader = ["Klient", "Objekt", "Aadress", "Töö", "Kogus", "Ühik", "Kliendi hind", "Summa"];
  const invoiceRows = invoiceSummary.map((row) => [row.clientName ?? "", row.siteName, row.siteAddress ?? "", row.label, Number(row.quantity.toFixed(3)), row.unit, row.rate, Number(row.amount.toFixed(2))]);
  const invoiceTotal = invoiceSummary.reduce((sum, row) => sum + row.amount, 0);
  invoiceRows.push(["KOKKU", "", "", "", "", "", "", Number(invoiceTotal.toFixed(2))]);

  // rows: worker, [day...], total hours, rate, gross, out-of-zone flags
  const header = ["Töötaja", "Hinna tüüp", "Ühik", ...matrix.days, "Tunnid kokku", "Hind", "Summa (salvestatud)", "Väljaspool tsooni"];
  const rows = matrix.workers.map((w) => {
    const totalH = matrix.totalsByWorker[w.id] / 3600;
    const gross = matrix.earningsByWorker[w.id];
    return [
      w.name,
      PRICING_LABELS[w.pricingType],
      pricingUnit(w.pricingType, w.unit),
      ...matrix.days.map((d) => {
        const h = matrix.hours[w.id]?.[d];
        return h ? Number(h.toFixed(2)) : "";
      }),
      Number(totalH.toFixed(2)),
      w.rate ?? "",
      Number(gross.toFixed(2)),
      matrix.flagsByWorker[w.id] || "",
    ];
  });

  // per-week sheet: hours and gross side by side for every pay week in the range
  const weekHeader = [
    "Töötaja",
    "Hinna tüüp",
    "Ühik",
    "Hind",
    ...weekly.weeks.flatMap((w) => [`${w.label} h`, `${w.label} €`]),
    "Tunnid kokku",
    "Summa kokku",
  ];
  const weekRows = matrix.workers.map((w) => [
    w.name,
    PRICING_LABELS[w.pricingType],
    pricingUnit(w.pricingType, w.unit),
    w.rate ?? "",
    ...weekly.weeks.flatMap((wk) => {
      const secs = weekly.seconds[w.id]?.[wk.key] ?? 0;
      const amt = weekly.earnings[w.id]?.[wk.key] ?? 0;
      return [secs ? Number((secs / 3600).toFixed(2)) : "", amt ? Number(amt.toFixed(2)) : ""];
    }),
    Number((matrix.totalsByWorker[w.id] / 3600).toFixed(2)),
    Number(matrix.earningsByWorker[w.id].toFixed(2)),
  ]);
  const weekTotals = [
    "KOKKU",
    "",
    "",
    "",
    ...weekly.weeks.flatMap((wk) => [
      Number((weekly.totalsByWeek[wk.key] / 3600).toFixed(2)),
      Number(weekly.earningsByWeek[wk.key].toFixed(2)),
    ]),
    Number((Object.values(matrix.totalsByWorker).reduce((a, b) => a + b, 0) / 3600).toFixed(2)),
    Number(Object.values(matrix.earningsByWorker).reduce((a, b) => a + b, 0).toFixed(2)),
  ];

  // A single-week export is named by its ISO week — that is how pay runs are filed.
  const scope = workerId ? `_${workerId.slice(0, 8)}` : "";
  const filename = isFullWeek(from, to)
    ? `tooaeg${scope}_${isoWeekYear(from)}-N${String(isoWeek(from)).padStart(2, "0")}_${fromStr}_${toStr}`
    : `tooaeg${scope}_${fromStr}_${toStr}`;

  const { error: auditError } = await supabaseService().from("audit_logs").insert({
    company_id: profile.company_id,
    actor_id: profile.id,
    action: "payroll.exported",
    target_type: "company",
    target_id: profile.company_id,
    metadata: { format, from: fromStr, to: toStr, worker_id: workerId || null, site_id: siteId || null },
  });
  if (auditError) return new NextResponse("Could not record export audit event", { status: 500 });

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WorkTime";
    workbook.created = new Date();

    const addReportSheet = (name: string, data: unknown[][]) => {
      const sheet = workbook.addWorksheet(name, {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      sheet.addRows(data);
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: data[0]?.length ?? 1 },
      };
      sheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155E75" } };
        cell.alignment = { vertical: "middle" };
      });
      sheet.getRow(1).height = 24;
      sheet.columns.forEach((column) => {
        let width = 12;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          width = Math.max(width, String(cell.value ?? "").length + 2);
        });
        column.width = Math.min(width, 36);
      });
      return sheet;
    };

    const invoiceSheet = addReportSheet("Kliendi arve alus", [invoiceHeader, ...invoiceRows]);
    const detailSheet = addReportSheet("Detailne aruanne", [detailHeader, ...detailRows]);
    addReportSheet("Nädalad", [weekHeader, ...weekRows, weekTotals]);
    addReportSheet("Päevad", [header, ...rows]);
    detailSheet.getColumn(10).numFmt = '#,##0.00 "€"';
    detailSheet.getColumn(11).numFmt = '#,##0.00 "€"';
    detailSheet.getColumn(12).numFmt = '#,##0.00 "€"';
    detailSheet.getColumn(13).numFmt = '#,##0.00 "€"';
    invoiceSheet.getColumn(7).numFmt = '#,##0.00 "€"';
    invoiceSheet.getColumn(8).numFmt = '#,##0.00 "€"';
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
    block([["DETAILNE ARUANNE"], detailHeader, ...detailRows]) +
    "\r\n\r\n" +
    block([["KLIENDI ARVE ALUS"], invoiceHeader, ...invoiceRows]) +
    "\r\n\r\n" +
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
