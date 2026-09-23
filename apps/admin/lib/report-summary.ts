import { clientShiftTotal, shiftTotal, type PricingType } from "./pricing.ts";

export type ReportShift = {
  id: string;
  user_id: string;
  site_id: string | null;
  site_name: string | null;
  site_address?: string | null;
  site_client_name?: string | null;
  work_date: string;
  started_at: string;
  ended_at?: string | null;
  worked_seconds: number | null;
  pricing_type: PricingType;
  pricing_rate: number | null;
  pricing_label?: string | null;
  quantity: number | null;
  unit: string | null;
  calculated_total: number | null;
  is_net?: boolean;
  client_rate_id?: string | null;
  client_pricing_rate?: number | null;
  client_calculated_total?: number | null;
};

export type ReportWorker = { id: string; first_name: string; last_name: string; currency: string };

export function quantityParts(shifts: ReportShift[]): string[] {
  const totals = new Map<string, number>();
  for (const shift of shifts) {
    if (shift.pricing_type === "hourly" || shift.quantity == null) continue;
    const unit = shift.pricing_type === "area" ? "m²" : shift.unit?.trim() || "ühik";
    totals.set(unit, (totals.get(unit) ?? 0) + Number(shift.quantity));
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([unit, value]) => `${formatQuantity(value)} ${unit}`);
}

export function summarizeWorkers(shifts: ReportShift[], workers: ReportWorker[]) {
  return workers.map((worker) => {
    const rows = shifts.filter((shift) => shift.user_id === worker.id);
    const gross = rows.filter((shift) => shift.is_net === false).reduce((sum, shift) => sum + shiftTotal(shift), 0);
    const net = rows.filter((shift) => shift.is_net !== false).reduce((sum, shift) => sum + shiftTotal(shift), 0);
    return {
      id: worker.id,
      name: `${worker.first_name} ${worker.last_name}`,
      currency: worker.currency,
      days: new Set(rows.map((shift) => shift.work_date)).size,
      hours: rows.reduce((sum, shift) => sum + (shift.worked_seconds ?? 0), 0) / 3600,
      sites: new Set(rows.map((shift) => shift.site_id).filter(Boolean)).size,
      quantities: quantityParts(rows),
      workTypes: [...new Set(rows.map((shift) => shift.pricing_label || shift.pricing_type))],
      gross,
      net,
      hasGross: rows.some((shift) => shift.is_net === false),
      hasNet: rows.some((shift) => shift.is_net !== false),
    };
  });
}

export function summarizeSites(shifts: ReportShift[]) {
  const grouped = new Map<string, { id: string; name: string; address: string | null; hours: number; quantities: Map<string, number>; amount: number; clientAmount: number; missingClientPrices: number; isNet: boolean }>();
  for (const shift of shifts) {
    const key = shift.site_id ?? "unassigned";
    const row = grouped.get(key) ?? { id: key, name: shift.site_name ?? "Objekt määramata", address: shift.site_address ?? null, hours: 0, quantities: new Map(), amount: 0, clientAmount: 0, missingClientPrices: 0, isNet: shift.is_net !== false };
    row.hours += (shift.worked_seconds ?? 0) / 3600;
    row.amount += shiftTotal(shift);
    const clientAmount = clientShiftTotal(shift);
    if (clientAmount == null) row.missingClientPrices += 1;
    else row.clientAmount += clientAmount;
    if (shift.pricing_type !== "hourly" && shift.quantity != null) {
      const unit = shift.pricing_type === "area" ? "m²" : shift.unit?.trim() || "ühik";
      row.quantities.set(unit, (row.quantities.get(unit) ?? 0) + Number(shift.quantity));
    }
    if (shift.is_net === false) row.isNet = false;
    grouped.set(key, row);
  }
  return [...grouped.values()].map((row) => ({ ...row, quantityLabels: [...row.quantities.entries()].map(([unit, value]) => `${formatQuantity(value)} ${unit}`) }));
}

export function summarizeClientInvoice(shifts: ReportShift[]) {
  const grouped = new Map<string, { siteId: string | null; siteName: string; siteAddress: string | null; clientName: string | null; label: string; pricingType: PricingType; unit: string; quantity: number; rate: number; amount: number }>();
  for (const shift of shifts) {
    if (shift.client_pricing_rate == null) continue;
    const unit = shift.pricing_type === "hourly" ? "h" : shift.pricing_type === "area" ? "m²" : shift.unit?.trim() || "ühik";
    const quantity = shift.pricing_type === "hourly" ? (shift.worked_seconds ?? 0) / 3600 : Number(shift.quantity ?? 0);
    const label = shift.pricing_label || shift.pricing_type;
    const key = [shift.site_id ?? "", label, shift.pricing_type, unit, shift.client_pricing_rate].join("|");
    const row = grouped.get(key) ?? { siteId: shift.site_id, siteName: shift.site_name ?? "Objekt määramata", siteAddress: shift.site_address ?? null, clientName: shift.site_client_name ?? null, label, pricingType: shift.pricing_type, unit, quantity: 0, rate: Number(shift.client_pricing_rate), amount: 0 };
    row.quantity += quantity;
    row.amount += clientShiftTotal(shift) ?? 0;
    grouped.set(key, row);
  }
  return [...grouped.values()];
}

export function formatQuantity(value: number): string {
  return value.toLocaleString("et-EE", { maximumFractionDigits: 3 });
}
