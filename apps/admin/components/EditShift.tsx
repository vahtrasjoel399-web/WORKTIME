"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface ShiftLite {
  id: string;
  started_at: string;
  ended_at: string | null;
  break_seconds: number;
  status: "open" | "closed";
}

// Manual correction with audit trail: every changed field is written to shift_edits
// as (field, old_value, new_value, edited_by). (spec §1, DECISIONS D-010)
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

// Worked hours the same way the database computes worked_seconds (D-014).
function workedHours(startIso: string | null, endIso: string | null, breakSeconds: number): number | null {
  if (!startIso || !endIso) return null;
  const secs = Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 1000) - breakSeconds;
  return Math.max(0, secs) / 3600;
}

// Steps for the quick correction row, in minutes.
const STEPS = [-60, -30, -15, 15, 30, 60];

export function EditShift({ shift }: { shift: ShiftLite }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(toLocalInput(shift.started_at));
  const [end, setEnd] = useState(toLocalInput(shift.ended_at));
  const [breakMin, setBreakMin] = useState(String(Math.round(shift.break_seconds / 60)));
  const [busy, setBusy] = useState(false);

  const newBreak = Math.max(0, parseInt(breakMin || "0", 10)) * 60;
  const before = workedHours(shift.started_at, shift.ended_at, shift.break_seconds);
  const after = workedHours(fromLocalInput(start), fromLocalInput(end), newBreak);
  const changed = after != null && before != null && Math.abs(after - before) > 0.004;

  // Add or remove worked time by moving the end of the shift. Never past the
  // start — an admin trimming hours can zero a shift but not invert it.
  function nudge(minutes: number) {
    const base = fromLocalInput(end) ?? shift.ended_at;
    if (!base) return;
    const startMs = Date.parse(fromLocalInput(start) ?? shift.started_at);
    const next = Math.max(startMs, Date.parse(base) + minutes * 60000);
    setEnd(toLocalInput(new Date(next).toISOString()));
  }

  async function save() {
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const newStart = new Date(start).toISOString();
    const newEnd = end ? new Date(end).toISOString() : null;

    const edits: { field: string; old_value: string | null; new_value: string | null }[] = [];
    if (newStart !== shift.started_at) edits.push({ field: "started_at", old_value: shift.started_at, new_value: newStart });
    if (newEnd !== shift.ended_at) edits.push({ field: "ended_at", old_value: shift.ended_at, new_value: newEnd });
    if (newBreak !== shift.break_seconds)
      edits.push({ field: "break_seconds", old_value: String(shift.break_seconds), new_value: String(newBreak) });

    if (edits.length > 0) {
      await supabase
        .from("shifts")
        .update({
          started_at: newStart,
          ended_at: newEnd,
          break_seconds: newBreak,
          status: newEnd ? "closed" : "open",
          source: "manual",
          is_stale: false,
        })
        .eq("id", shift.id);
      await supabase.from("shift_edits").insert(
        edits.map((e) => ({ shift_id: shift.id, edited_by: user.id, ...e })),
      );
    }
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-muted underline hover:text-signal">
        Muuda tunde
      </button>
    );

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border bg-bg p-3 text-sm">
      {/* quick correction — add or take away worked time */}
      {shift.status === "closed" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted">Lisa või võta tunde</span>
            <span className="tabular">
              {before?.toFixed(1)} h
              {changed && (
                <>
                  {" → "}
                  <b className={after! < before! ? "text-alert" : "text-signal"}>{after!.toFixed(1)} h</b>
                </>
              )}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {STEPS.map((m) => (
              <button
                key={m}
                onClick={() => nudge(m)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-signal"
              >
                {m > 0 ? "+" : "−"}
                {Math.abs(m) === 60 ? "1 h" : `${Math.abs(m)} min`}
              </button>
            ))}
            <button
              onClick={() => { setEnd(toLocalInput(shift.ended_at)); setBreakMin(String(Math.round(shift.break_seconds / 60))); }}
              className="rounded-lg px-2.5 py-1 text-xs text-muted underline hover:text-text"
            >
              Algseks
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-2">
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted">Algus</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border border-border bg-surface px-2 py-1" />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted">Lõpp</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border border-border bg-surface px-2 py-1" />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted">Paus (min)</span>
          <input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="w-24 rounded border border-border bg-surface px-2 py-1" />
        </label>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex-1 rounded bg-text py-1.5 font-medium text-bg disabled:opacity-60">
          {busy ? "…" : "Salvesta"}
        </button>
        <button onClick={() => setOpen(false)} className="flex-1 rounded border border-border py-1.5">
          Tühista
        </button>
      </div>
      <p className="text-xs text-muted">Iga muudatus jääb logisse (kes, millal, mis väärtus oli).</p>
    </div>
  );
}
