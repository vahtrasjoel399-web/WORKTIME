import type { ShiftReport } from "./types";

export type RateSource = "company" | "personal" | "none";

// Same rate-resolution rule as the mobile app: employer rate wins, else the
// worker's own estimate, else nothing. (DECISIONS D-013)
export function resolveEarnings(
  seconds: number,
  hourlyRate: number | null,
  selfRate: number | null,
): { amount: number; rate: number | null; source: RateSource } {
  const rate = hourlyRate ?? selfRate ?? null;
  const source: RateSource = hourlyRate != null ? "company" : selfRate != null ? "personal" : "none";
  return { amount: rate != null ? (seconds / 3600) * rate : 0, rate, source };
}

export interface ReportMatrix {
  workers: { id: string; name: string; rate: number | null; currency: string }[];
  days: string[]; // yyyy-mm-dd
  // hours[workerId][day] = decimal hours
  hours: Record<string, Record<string, number>>;
  totalsByWorker: Record<string, number>; // seconds
  flagsByWorker: Record<string, number>; // out-of-zone count
}

// Builds the "worker × day × hours" matrix used by the report table + exports.
export function buildMatrix(
  shifts: ShiftReport[],
  workers: { id: string; first_name: string; last_name: string; hourly_rate: number | null; self_hourly_rate: number | null; currency: string }[],
  from: Date,
  to: Date,
): ReportMatrix {
  const days: string[] = [];
  for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  const hours: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  const flags: Record<string, number> = {};

  for (const w of workers) {
    hours[w.id] = {};
    totals[w.id] = 0;
    flags[w.id] = 0;
  }
  for (const s of shifts) {
    const day = s.work_date;
    if (!hours[s.user_id]) continue;
    const h = (s.worked_seconds ?? 0) / 3600;
    hours[s.user_id][day] = (hours[s.user_id][day] ?? 0) + h;
    totals[s.user_id] += s.worked_seconds ?? 0;
    if (s.out_of_zone) flags[s.user_id] += 1;
  }

  return {
    workers: workers.map((w) => ({
      id: w.id,
      name: `${w.first_name} ${w.last_name}`,
      rate: w.hourly_rate ?? w.self_hourly_rate ?? null,
      currency: w.currency,
    })),
    days,
    hours,
    totalsByWorker: totals,
    flagsByWorker: flags,
  };
}
