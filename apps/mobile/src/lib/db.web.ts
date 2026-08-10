// Web build of the local store. Metro picks this file over db.ts when the app runs
// in a browser (react-native-web). SQLite isn't available on web, so we back the
// same interface with AsyncStorage (which is localStorage on web). Same shape as
// db.ts so nothing else in the app changes. (mirrors DECISIONS D-008)
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface LocalShift {
  local_id: string;
  remote_id: string | null;
  user_id: string;
  company_id: string;
  site_id: string | null;
  started_at: string;
  start_lat: number | null;
  start_lng: number | null;
  start_accuracy_m: number | null;
  start_address: string | null;
  ended_at: string | null;
  end_lat: number | null;
  end_lng: number | null;
  end_accuracy_m: number | null;
  end_address: string | null;
  break_seconds: number;
  status: "open" | "closed";
  synced: number;
}

export interface LocalBreak {
  local_id: string;
  shift_local_id: string;
  started_at: string;
  ended_at: string | null;
  synced: number;
}

const SHIFTS_KEY = "web_shifts";
const BREAKS_KEY = "web_breaks";

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readShifts(): Promise<LocalShift[]> {
  const raw = await AsyncStorage.getItem(SHIFTS_KEY);
  return raw ? (JSON.parse(raw) as LocalShift[]) : [];
}
async function writeShifts(rows: LocalShift[]): Promise<void> {
  await AsyncStorage.setItem(SHIFTS_KEY, JSON.stringify(rows));
}
async function readBreaks(): Promise<LocalBreak[]> {
  const raw = await AsyncStorage.getItem(BREAKS_KEY);
  return raw ? (JSON.parse(raw) as LocalBreak[]) : [];
}
async function writeBreaks(rows: LocalBreak[]): Promise<void> {
  await AsyncStorage.setItem(BREAKS_KEY, JSON.stringify(rows));
}

export async function getOpenShift(userId: string): Promise<LocalShift | null> {
  const rows = await readShifts();
  return rows.find((s) => s.user_id === userId && s.status === "open") ?? null;
}

export async function startShift(
  input: Omit<
    LocalShift,
    "local_id" | "remote_id" | "synced" | "status" | "ended_at" | "end_lat" | "end_lng" | "end_accuracy_m" | "end_address"
  >,
): Promise<LocalShift> {
  const rows = await readShifts();
  const row: LocalShift = {
    local_id: uuid(),
    remote_id: null,
    ended_at: null,
    end_lat: null,
    end_lng: null,
    end_accuracy_m: null,
    end_address: null,
    status: "open",
    synced: 0,
    ...input,
  };
  rows.push(row);
  await writeShifts(rows);
  return row;
}

export async function endShift(
  localId: string,
  end: { ended_at: string; end_lat: number | null; end_lng: number | null; end_accuracy_m: number | null; end_address: string | null; break_seconds: number },
): Promise<void> {
  const rows = await readShifts();
  const s = rows.find((r) => r.local_id === localId);
  if (s) {
    Object.assign(s, end, { status: "closed" as const, synced: 0 });
    await writeShifts(rows);
  }
}

export async function updateBreakSeconds(localId: string, seconds: number): Promise<void> {
  const rows = await readShifts();
  const s = rows.find((r) => r.local_id === localId);
  if (s) {
    s.break_seconds = seconds;
    s.synced = 0;
    await writeShifts(rows);
  }
}

export async function beginBreak(shiftLocalId: string): Promise<LocalBreak> {
  const breaks = await readBreaks();
  const b: LocalBreak = { local_id: uuid(), shift_local_id: shiftLocalId, started_at: new Date().toISOString(), ended_at: null, synced: 0 };
  breaks.push(b);
  await writeBreaks(breaks);
  return b;
}

export async function endOpenBreak(shiftLocalId: string): Promise<number> {
  const breaks = await readBreaks();
  const open = breaks.find((b) => b.shift_local_id === shiftLocalId && b.ended_at === null);
  if (!open) return 0;
  const now = new Date().toISOString();
  open.ended_at = now;
  open.synced = 0;
  await writeBreaks(breaks);
  return Math.max(0, Math.floor((Date.parse(now) - Date.parse(open.started_at)) / 1000));
}

export async function getMonthShifts(userId: string, year: number, month: number): Promise<LocalShift[]> {
  const from = new Date(Date.UTC(year, month, 1)).getTime();
  const to = new Date(Date.UTC(year, month + 1, 1)).getTime();
  const rows = await readShifts();
  return rows
    .filter((s) => s.user_id === userId && Date.parse(s.started_at) >= from && Date.parse(s.started_at) < to)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

export async function pendingShifts(): Promise<LocalShift[]> {
  const rows = await readShifts();
  return rows.filter((s) => s.synced === 0);
}

export async function markSynced(localId: string, remoteId: string): Promise<void> {
  const rows = await readShifts();
  const s = rows.find((r) => r.local_id === localId);
  if (s) {
    s.synced = 1;
    s.remote_id = remoteId;
    await writeShifts(rows);
  }
}

export async function upsertFromServer(serverRows: Partial<LocalShift>[]): Promise<void> {
  const rows = await readShifts();
  for (const r of serverRows) {
    if (!r.remote_id) continue;
    const existing = rows.find((x) => x.remote_id === r.remote_id);
    if (existing && existing.synced === 0) continue;
    if (existing) {
      Object.assign(existing, {
        site_id: r.site_id ?? null,
        started_at: r.started_at!,
        ended_at: r.ended_at ?? null,
        break_seconds: r.break_seconds ?? 0,
        status: r.status!,
        synced: 1,
      });
    } else {
      rows.push({
        local_id: uuid(),
        remote_id: r.remote_id,
        user_id: r.user_id!,
        company_id: r.company_id!,
        site_id: r.site_id ?? null,
        started_at: r.started_at!,
        start_lat: r.start_lat ?? null,
        start_lng: r.start_lng ?? null,
        start_accuracy_m: r.start_accuracy_m ?? null,
        start_address: r.start_address ?? null,
        ended_at: r.ended_at ?? null,
        end_lat: r.end_lat ?? null,
        end_lng: r.end_lng ?? null,
        end_accuracy_m: r.end_accuracy_m ?? null,
        end_address: r.end_address ?? null,
        break_seconds: r.break_seconds ?? 0,
        status: (r.status as "open" | "closed") ?? "closed",
        synced: 1,
      });
    }
  }
  await writeShifts(rows);
}
