import NetInfo from "@react-native-community/netinfo";
import { supabase } from "./supabase";
import { IS_DEMO } from "./config";
import { markSynced, pendingShifts, upsertFromServer } from "./db";

// Flushes the local outbox to Supabase, then pulls the server's month for the user.
// Called on reconnect and on app-foreground. Idempotent. (DECISIONS D-008)

let syncing = false;

export async function flush(): Promise<{ pushed: number }> {
  if (IS_DEMO) return { pushed: 0 }; // local-only demo: nothing to sync
  if (syncing) return { pushed: 0 };
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { pushed: 0 };

  syncing = true;
  let pushed = 0;
  try {
    const rows = await pendingShifts();
    for (const r of rows) {
      const payload = {
        user_id: r.user_id,
        company_id: r.company_id,
        site_id: r.site_id,
        started_at: r.started_at,
        start_lat: r.start_lat,
        start_lng: r.start_lng,
        start_accuracy_m: r.start_accuracy_m,
        start_address: r.start_address,
        ended_at: r.ended_at,
        end_lat: r.end_lat,
        end_lng: r.end_lng,
        end_accuracy_m: r.end_accuracy_m,
        end_address: r.end_address,
        break_seconds: r.break_seconds,
        status: r.status,
        source: "app" as const,
      };

      if (r.remote_id) {
        // Existing punches may only advance their mutable end-state. Do not
        // resend tenant/start fields: the database owns those fields and may
        // have resolved site_id after the original offline insert.
        const { error } = await supabase
          .from("shifts")
          .update({
            ended_at: r.ended_at,
            end_lat: r.end_lat,
            end_lng: r.end_lng,
            end_accuracy_m: r.end_accuracy_m,
            end_address: r.end_address,
            break_seconds: r.break_seconds,
            status: r.status,
          })
          .eq("id", r.remote_id);
        if (!error) {
          await markSynced(r.local_id, r.remote_id);
          pushed++;
        }
      } else {
        const { data, error } = await supabase.from("shifts").insert(payload).select("id").single();
        if (!error && data) {
          await markSynced(r.local_id, data.id as string);
          pushed++;
        }
      }
    }
  } finally {
    syncing = false;
  }
  return { pushed };
}

export async function pullMonth(userId: string, year: number, month: number): Promise<void> {
  if (IS_DEMO) return; // local-only demo
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;
  const from = new Date(Date.UTC(year, month, 1)).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  const { data } = await supabase
    .from("shifts")
    .select("*")
    .eq("user_id", userId)
    .gte("started_at", from)
    .lt("started_at", to);
  if (data) {
    await upsertFromServer(data.map((d) => ({ ...d, remote_id: d.id })));
  }
}

// Subscribe once at app start; returns an unsubscribe.
export function startAutoSync(): () => void {
  const unsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) void flush();
  });
  return unsub;
}
