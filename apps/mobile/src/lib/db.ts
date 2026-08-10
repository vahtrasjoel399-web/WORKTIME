import * as SQLite from "expo-sqlite";

// Local-first store. The home screen reads from here so the timer is instant and
// correct with no network. Rows with synced=0 are the outbox. (DECISIONS D-008)

export interface LocalShift {
  local_id: string;
  remote_id: string | null;
  user_id: string;
  company_id: string;
  site_id: string | null;
  started_at: string; // ISO
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
  synced: number; // 0 = pending push, 1 = in sync with server
}

export interface LocalBreak {
  local_id: string;
  shift_local_id: string;
  started_at: string;
  ended_at: string | null;
  synced: number;
}

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync("tooaeg.db");
  await db.execAsync(`
    pragma journal_mode = WAL;
    create table if not exists shifts_local (
      local_id text primary key,
      remote_id text,
      user_id text not null,
      company_id text not null,
      site_id text,
      started_at text not null,
      start_lat real, start_lng real, start_accuracy_m real, start_address text,
      ended_at text,
      end_lat real, end_lng real, end_accuracy_m real, end_address text,
      break_seconds integer not null default 0,
      status text not null default 'open',
      synced integer not null default 0
    );
    create table if not exists breaks_local (
      local_id text primary key,
      shift_local_id text not null,
      started_at text not null,
      ended_at text,
      synced integer not null default 0
    );
    create index if not exists idx_shifts_status on shifts_local(status);
  `);
  _db = db;
  return db;
}

function uuid(): string {
  // RFC4122-ish v4, good enough as a client-side local id
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOpenShift(userId: string): Promise<LocalShift | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<LocalShift>(
      `select * from shifts_local where user_id = ? and status = 'open' limit 1`,
      [userId],
    )) ?? null
  );
}

export async function startShift(input: Omit<LocalShift, "local_id" | "remote_id" | "synced" | "status" | "ended_at" | "end_lat" | "end_lng" | "end_accuracy_m" | "end_address">): Promise<LocalShift> {
  const db = await getDb();
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
  await db.runAsync(
    `insert into shifts_local
      (local_id, remote_id, user_id, company_id, site_id, started_at,
       start_lat, start_lng, start_accuracy_m, start_address, break_seconds, status, synced)
     values (?,?,?,?,?,?,?,?,?,?,?, 'open', 0)`,
    [
      row.local_id, row.remote_id, row.user_id, row.company_id, row.site_id, row.started_at,
      row.start_lat, row.start_lng, row.start_accuracy_m, row.start_address, row.break_seconds,
    ],
  );
  return row;
}

export async function endShift(
  localId: string,
  end: { ended_at: string; end_lat: number | null; end_lng: number | null; end_accuracy_m: number | null; end_address: string | null; break_seconds: number },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `update shifts_local
        set ended_at=?, end_lat=?, end_lng=?, end_accuracy_m=?, end_address=?,
            break_seconds=?, status='closed', synced=0
      where local_id=?`,
    [end.ended_at, end.end_lat, end.end_lng, end.end_accuracy_m, end.end_address, end.break_seconds, localId],
  );
}

export async function updateBreakSeconds(localId: string, seconds: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`update shifts_local set break_seconds=?, synced=0 where local_id=?`, [seconds, localId]);
}

export async function beginBreak(shiftLocalId: string): Promise<LocalBreak> {
  const db = await getDb();
  const b: LocalBreak = { local_id: uuid(), shift_local_id: shiftLocalId, started_at: new Date().toISOString(), ended_at: null, synced: 0 };
  await db.runAsync(
    `insert into breaks_local (local_id, shift_local_id, started_at, ended_at, synced) values (?,?,?,?,0)`,
    [b.local_id, b.shift_local_id, b.started_at, null],
  );
  return b;
}

export async function endOpenBreak(shiftLocalId: string): Promise<number> {
  // closes the currently-open break and returns its duration in seconds
  const db = await getDb();
  const open = await db.getFirstAsync<LocalBreak>(
    `select * from breaks_local where shift_local_id=? and ended_at is null limit 1`,
    [shiftLocalId],
  );
  if (!open) return 0;
  const now = new Date().toISOString();
  await db.runAsync(`update breaks_local set ended_at=?, synced=0 where local_id=?`, [now, open.local_id]);
  return Math.max(0, Math.floor((Date.parse(now) - Date.parse(open.started_at)) / 1000));
}

export async function getMonthShifts(userId: string, year: number, month: number): Promise<LocalShift[]> {
  const db = await getDb();
  const from = new Date(Date.UTC(year, month, 1)).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  return db.getAllAsync<LocalShift>(
    `select * from shifts_local where user_id=? and started_at >= ? and started_at < ?
       order by started_at desc`,
    [userId, from, to],
  );
}

export async function pendingShifts(): Promise<LocalShift[]> {
  const db = await getDb();
  return db.getAllAsync<LocalShift>(`select * from shifts_local where synced = 0`);
}

export async function markSynced(localId: string, remoteId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`update shifts_local set synced=1, remote_id=? where local_id=?`, [remoteId, localId]);
}

// Overwrite local rows with authoritative server rows (pull). Keeps unsynced local edits.
export async function upsertFromServer(rows: Partial<LocalShift>[]): Promise<void> {
  const db = await getDb();
  for (const r of rows) {
    if (!r.remote_id) continue;
    const existing = await db.getFirstAsync<LocalShift>(
      `select * from shifts_local where remote_id=? limit 1`,
      [r.remote_id],
    );
    if (existing && existing.synced === 0) continue; // don't clobber pending local edits
    if (existing) {
      await db.runAsync(
        `update shifts_local set site_id=?, started_at=?, ended_at=?, break_seconds=?, status=?, synced=1 where remote_id=?`,
        [r.site_id ?? null, r.started_at!, r.ended_at ?? null, r.break_seconds ?? 0, r.status!, r.remote_id],
      );
    } else {
      await db.runAsync(
        `insert into shifts_local
          (local_id, remote_id, user_id, company_id, site_id, started_at,
           start_lat,start_lng,start_accuracy_m,start_address,
           ended_at,end_lat,end_lng,end_accuracy_m,end_address,
           break_seconds, status, synced)
         values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 1)`,
        [
          uuid(), r.remote_id, r.user_id!, r.company_id!, r.site_id ?? null, r.started_at!,
          r.start_lat ?? null, r.start_lng ?? null, r.start_accuracy_m ?? null, r.start_address ?? null,
          r.ended_at ?? null, r.end_lat ?? null, r.end_lng ?? null, r.end_accuracy_m ?? null, r.end_address ?? null,
          r.break_seconds ?? 0, r.status ?? "closed",
        ],
      );
    }
  }
}
