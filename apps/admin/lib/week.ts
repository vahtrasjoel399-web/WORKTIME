// Wages are paid weekly (D-015), so every period in the panel is an ISO week —
// Monday..Sunday — computed in UTC, the same clock `v_shift_report.work_date`
// uses, so a day never lands in two different weeks depending on the caller.

const DAY_MS = 86_400_000;

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

/** Monday 00:00 UTC of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // Monday = 0
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

/** Inclusive yyyy-mm-dd bounds of the week containing `d` (the form the pages use). */
export function weekRange(d: Date): { from: string; to: string } {
  const mon = startOfWeek(d);
  return { from: ymd(mon), to: ymd(addDays(mon, 6)) };
}

/** ISO-8601 week number: week 1 is the one holding the first Thursday of the year. */
export function isoWeek(d: Date): number {
  const thu = addDays(startOfWeek(d), 3);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return Math.ceil(((thu.getTime() - jan1) / DAY_MS + 1) / 7);
}

/** The year the ISO week belongs to — late December can already be week 1 of next year. */
export function isoWeekYear(d: Date): number {
  return addDays(startOfWeek(d), 3).getUTCFullYear();
}

/** Sort/group key for a week, e.g. "2026-W35". */
export function weekKey(d: Date): string {
  return `${isoWeekYear(d)}-W${String(isoWeek(d)).padStart(2, "0")}`;
}

/** "24.08–30.08" — the week's span without a language-specific prefix. */
export function weekDates(d: Date): string {
  const mon = startOfWeek(d);
  const dm = (x: Date) =>
    `${String(x.getUTCDate()).padStart(2, "0")}.${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${dm(mon)}–${dm(addDays(mon, 6))}`;
}

/** "N35 · 24.08–30.08" — short enough for a table header. */
export function weekLabel(d: Date): string {
  return `N${isoWeek(d)} · ${weekDates(d)}`;
}

/** True when [from, toExclusive) is exactly one Monday..Sunday week. */
export function isFullWeek(from: Date, toExclusive: Date): boolean {
  return (
    startOfWeek(from).getTime() === from.getTime() &&
    toExclusive.getTime() - from.getTime() === 7 * DAY_MS
  );
}
