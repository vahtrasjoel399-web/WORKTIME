"use client";

// Triggers the server export route with the current period; the browser downloads
// the file. Two formats: CSV (universal) and XLSX (for payroll spreadsheets).
export function ExportButtons({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex gap-2">
      <a
        href={`/api/export?format=csv&from=${from}&to=${to}`}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-signal"
      >
        Ekspordi CSV
      </a>
      <a
        href={`/api/export?format=xlsx&from=${from}&to=${to}`}
        className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg"
      >
        Ekspordi XLSX
      </a>
    </div>
  );
}
