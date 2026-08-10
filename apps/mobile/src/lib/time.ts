// Worked-seconds and formatting helpers shared by the home screen and My Hours.

export function elapsedSeconds(startedAtIso: string, breakSeconds: number, now = Date.now()): number {
  const raw = Math.floor((now - Date.parse(startedAtIso)) / 1000) - breakSeconds;
  return Math.max(0, raw);
}

export function workedSeconds(startedAtIso: string, endedAtIso: string | null, breakSeconds: number): number {
  if (!endedAtIso) return 0;
  return Math.max(0, Math.floor((Date.parse(endedAtIso) - Date.parse(startedAtIso)) / 1000) - breakSeconds);
}

// "07:42:11" — always two digits, monospaced tabular figures keep it from jittering.
export function hms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

// "7.2 h" for lists/reports
export function hoursDecimal(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 100) / 100;
}

export function timeOfDay(iso: string, locale = "et-EE"): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}
