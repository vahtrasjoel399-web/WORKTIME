// Earnings are computed at display time, never stored. (DECISIONS D-013)
// Source of the rate decides the label the worker sees.

export type RateSource = "company" | "personal" | "none";

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

export function formatMoney(amount: number, currency: string, locale = "et-EE"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
