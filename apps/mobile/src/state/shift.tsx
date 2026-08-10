import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  beginBreak,
  endOpenBreak,
  endShift as dbEndShift,
  getOpenShift,
  startShift as dbStartShift,
  updateBreakSeconds,
  type LocalShift,
} from "@/lib/db";
import { captureFix } from "@/lib/location";
import { flush } from "@/lib/sync";
import { elapsedSeconds } from "@/lib/time";
import { supabase } from "@/lib/supabase";
import type { Profile } from "./session";

export type Phase = "idle" | "running" | "onBreak";

export interface ShiftView {
  phase: Phase;
  seconds: number; // worked seconds so far (breaks excluded), live
  shift: LocalShift | null;
  gps: "pending" | "confirmed" | null;
  busy: boolean;
  lastSummarySeconds: number | null; // for the finish summary card
  error: string | null;
}

// Assigned-site lookup so a new punch is attributed to the worker's site.
async function currentSiteId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("default_site_id")
    .eq("id", userId)
    .single();
  return (data?.default_site_id as string | null) ?? null;
}

export function useShiftController(profile: Profile | null) {
  const [state, setState] = useState<ShiftView>({
    phase: "idle",
    seconds: 0,
    shift: null,
    gps: null,
    busy: false,
    lastSummarySeconds: null,
    error: null,
  });
  const breakStartRef = useRef<number | null>(null);
  const breakAccumRef = useRef<number>(0);

  // hydrate from local db (works offline)
  useEffect(() => {
    if (!profile) return;
    getOpenShift(profile.id).then((open) => {
      if (open) {
        breakAccumRef.current = open.break_seconds;
        setState((s) => ({
          ...s,
          phase: "running",
          shift: open,
          seconds: elapsedSeconds(open.started_at, open.break_seconds),
        }));
      }
    });
  }, [profile]);

  // 1s tick — drives timer + earnings count-up
  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => {
        if (s.phase === "running" && s.shift) {
          return { ...s, seconds: elapsedSeconds(s.shift.started_at, breakAccumRef.current) };
        }
        return s;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // sync on foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") void flush();
    });
    return () => sub.remove();
  }, []);

  const start = useCallback(async () => {
    if (!profile) return;
    setState((s) => ({ ...s, busy: true, gps: "pending", error: null }));
    try {
      const fix = await captureFix();
      const siteId = await currentSiteId(profile.id).catch(() => null);
      const shift = await dbStartShift({
        user_id: profile.id,
        company_id: profile.company_id,
        site_id: siteId,
        started_at: new Date().toISOString(),
        start_lat: fix.lat,
        start_lng: fix.lng,
        start_accuracy_m: fix.accuracy_m,
        start_address: fix.address,
        break_seconds: 0,
      });
      breakAccumRef.current = 0;
      setState((s) => ({
        ...s,
        phase: "running",
        shift,
        seconds: 0,
        gps: "confirmed",
        busy: false,
      }));
      void flush(); // push open shift so admin live map sees it
    } catch (e: any) {
      setState((s) => ({
        ...s,
        busy: false,
        gps: null,
        error: e?.message === "location-denied" ? "location-denied" : "start-failed",
      }));
    }
  }, [profile]);

  const finish = useCallback(async () => {
    if (!state.shift) return;
    setState((s) => ({ ...s, busy: true, gps: "pending", error: null }));
    try {
      const fix = await captureFix();
      // close any open break first
      if (breakStartRef.current) {
        breakAccumRef.current += Math.floor((Date.now() - breakStartRef.current) / 1000);
        breakStartRef.current = null;
        await endOpenBreak(state.shift.local_id);
      }
      const endedAt = new Date().toISOString();
      await dbEndShift(state.shift.local_id, {
        ended_at: endedAt,
        end_lat: fix.lat,
        end_lng: fix.lng,
        end_accuracy_m: fix.accuracy_m,
        end_address: fix.address,
        break_seconds: breakAccumRef.current,
      });
      const worked = elapsedSeconds(state.shift.started_at, breakAccumRef.current, Date.parse(endedAt));
      setState((s) => ({
        ...s,
        phase: "idle",
        shift: null,
        seconds: 0,
        gps: null,
        busy: false,
        lastSummarySeconds: worked,
      }));
      void flush();
    } catch (e: any) {
      setState((s) => ({
        ...s,
        busy: false,
        gps: null,
        error: e?.message === "location-denied" ? "location-denied" : "finish-failed",
      }));
    }
  }, [state.shift]);

  const toggleBreak = useCallback(async () => {
    if (!state.shift) return;
    if (state.phase === "running") {
      breakStartRef.current = Date.now();
      await beginBreak(state.shift.local_id);
      setState((s) => ({ ...s, phase: "onBreak" }));
    } else if (state.phase === "onBreak") {
      const added = await endOpenBreak(state.shift.local_id);
      breakAccumRef.current += added;
      breakStartRef.current = null;
      await updateBreakSeconds(state.shift.local_id, breakAccumRef.current);
      setState((s) => ({
        ...s,
        phase: "running",
        seconds: elapsedSeconds(s.shift!.started_at, breakAccumRef.current),
      }));
    }
  }, [state.phase, state.shift]);

  const clearSummary = useCallback(() => setState((s) => ({ ...s, lastSummarySeconds: null })), []);

  return { state, start, finish, toggleBreak, clearSummary };
}
