"use client";

// Triggers the server export route with the current period; the browser downloads
// the file. Two formats: CSV (universal) and XLSX (for payroll spreadsheets).
export function ExportButtons({ from, to, workerId, siteId }: { from: string; to: string; workerId?: string; siteId?: string }) {
  const filters = `${workerId ? `&worker=${encodeURIComponent(workerId)}` : ""}${siteId ? `&site=${encodeURIComponent(siteId)}` : ""}`;
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`/api/export?format=csv&from=${from}&to=${to}${filters}`}
        className="btn-secondary"
      >
        {workerId ? "Ekspordi töötaja CSV" : "Ekspordi kõik CSV"}
      </a>
      <a
        href={`/api/export?format=xlsx&from=${from}&to=${to}${filters}`}
        className="btn-primary"
      >
        {workerId ? "Ekspordi töötaja Excelisse (.xlsx)" : "Ekspordi kõik Excelisse (.xlsx)"}
      </a>
    </div>
  );
}
