// Earnings are computed at display time, never stored. (DECISIONS D-013)
// Source of the rate decides the label the worker sees.

export type RateSource = "company" | "personal" | "none";
export type PricingType = "hourly" | "area" | "quantity";

export interface RateResolution {
  rate: number | null;
  source: RateSource;
}

export function resolveRate(hourlyRate: number | null, selfRate: number | null): RateResolution {
  if (hourlyRate != null) return { rate: hourlyRate, source: "company" };
  if (selfRate != null) return { rate: selfRate, source: "personal" };
  return { rate: null, source: "none" };
}

export function earningsFor(seconds: number, rate: number | null): number {
  if (rate == null) return 0;
  return (seconds / 3600) * rate;
}

export function pricingTotal(
  pricingType: PricingType,
  rate: number | null,
  seconds: number,
  quantity: number | null = null,
): number | null {
  if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
  const basis = pricingType === "hourly" ? Math.max(0, seconds) / 3600 : quantity;
  if (basis == null || !Number.isFinite(basis) || basis < 0) return null;
  return Math.round(basis * rate * 100) / 100;
}

export function savedShiftTotal(
  shift: { pricing_type?: PricingType | null; pricing_rate?: number | null; quantity?: number | null; calculated_total?: number | null },
  seconds: number,
  fallbackRate: number | null,
): number {
  if (shift.calculated_total != null) return Number(shift.calculated_total);
  return pricingTotal(shift.pricing_type ?? "hourly", shift.pricing_rate ?? fallbackRate, seconds, shift.quantity ?? null) ?? 0;
}

export function formatMoney(amount: number, currency: string, locale = "et-EE"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
