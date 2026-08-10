import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabase-server";
import { buildMatrix } from "@/lib/report";
import type { ShiftReport } from "@/lib/types";

export const dynamic = "force-dynamic";

// Payroll export. Reads through the caller's session so RLS scopes it to the
// admin's own company. Produces a worker × day matrix with totals + rate + gross.
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const fromStr = req.nextUrl.searchParams.get("from")!;
  const toStr = req.nextUrl.searchParams.get("to")!;
  const from = new Date(fromStr + "T00:00:00Z");
  const to = new Date(toStr + "T00:00:00Z");
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

  const matrix = buildMatrix((shiftsRaw ?? []) as ShiftReport[], workers ?? [], from, to);

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

  const filename = `tooaeg_${fromStr}_${toStr}`;

  if (format === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Aruanne");
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
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
