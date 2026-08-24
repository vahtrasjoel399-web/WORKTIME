import type { ShiftReport } from "./types";
import { parseYmd, weekKey, weekLabel } from "./week";

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

export interface WorkerRow {
  id: string;
  first_name: string;
  last_name: string;
  hourly_rate: number | null;
  self_hourly_rate: number | null;
  currency: string;
}

export interface ReportMatrix {
  workers: { id: string; name: string; rate: number | null; currency: string }[];
  days: string[]; // yyyy-mm-dd
  // hours[workerId][day] = decimal hours
  hours: Record<string, Record<string, number>>;
  totalsByWorker: Record<string, number>; // seconds
  earningsByWorker: Record<string, number>; // gross, pre-tax, in the worker's currency
  flagsByWorker: Record<string, number>; // out-of-zone count
}

// Builds the "worker × day × hours" matrix used by the report table + exports.
export function buildMatrix(
  shifts: ShiftReport[],
  workers: WorkerRow[],
  from: Date,
  to: Date,
): ReportMatrix {
  const days: string[] = [];
  // UTC steps: a local-time step would duplicate or skip a day across a DST change.
  for (let d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  const hours: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  const earnings: Record<string, number> = {};
  const flags: Record<string, number> = {};

  for (const w of workers) {
    hours[w.id] = {};
    totals[w.id] = 0;
    earnings[w.id] = 0;
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
  for (const w of workers) {
    earnings[w.id] = resolveEarnings(totals[w.id], w.hourly_rate, w.self_hourly_rate).amount;
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
    earningsByWorker: earnings,
    flagsByWorker: flags,
  };
}

export interface WeeklyBreakdown {
  weeks: { key: string; label: string; from: string }[]; // chronological
  // seconds[workerId][weekKey]
  seconds: Record<string, Record<string, number>>;
  earnings: Record<string, Record<string, number>>;
  totalsByWeek: Record<string, number>; // seconds, all workers
  earningsByWeek: Record<string, number>;
}

// Pay runs every week, so any period longer than one week is also summarised
// week by week — that table is what actually gets paid out.
export function buildWeekly(matrix: ReportMatrix, workers: WorkerRow[]): WeeklyBreakdown {
  const weeks = new Map<string, { key: string; label: string; from: string }>();
  const seconds: Record<string, Record<string, number>> = {};
  const earnings: Record<string, Record<string, number>> = {};
  const totalsByWeek: Record<string, number> = {};
  const earningsByWeek: Record<string, number> = {};

  for (const day of matrix.days) {
    const d = parseYmd(day);
    const key = weekKey(d);
    if (!weeks.has(key)) weeks.set(key, { key, label: weekLabel(d), from: day });
    totalsByWeek[key] ??= 0;
    earningsByWeek[key] ??= 0;
  }

  for (const w of workers) {
    seconds[w.id] = {};
    earnings[w.id] = {};
    for (const day of matrix.days) {
      const h = matrix.hours[w.id]?.[day];
      if (!h) continue;
      const key = weekKey(parseYmd(day));
      const secs = h * 3600;
      seconds[w.id][key] = (seconds[w.id][key] ?? 0) + secs;
      totalsByWeek[key] += secs;
    }
    for (const [key, secs] of Object.entries(seconds[w.id])) {
      const amount = resolveEarnings(secs, w.hourly_rate, w.self_hourly_rate).amount;
      earnings[w.id][key] = amount;
      earningsByWeek[key] += amount;
    }
  }

  return {
    weeks: [...weeks.values()].sort((a, b) => a.from.localeCompare(b.from)),
    seconds,
    earnings,
    totalsByWeek,
    earningsByWeek,
  };
}
