"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Hours for a day the worker never clocked — forgot to press start, worked off
// the app, or the punch was thrown away as wrong. Written as source = 'manual'
// with an audit row, so a hand-entered shift is never mistaken for a GPS one.
export function AddShift({
  userId,
  companyId,
  workerName,
}: {
  userId: string;
  companyId: string;
  workerName: string;
}) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("16:30");
  const [breakMin, setBreakMin] = useState("30");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startMs = Date.parse(`${date}T${from}`);
  const endMs = Date.parse(`${date}T${to}`);
  const breakSecs = Math.max(0, parseInt(breakMin || "0", 10)) * 60;
  // A shift that ends before it starts crossed midnight — count it into the next day.
  const spanSecs = Math.floor(((endMs > startMs ? endMs : endMs + 86400000) - startMs) / 1000);
  const hours = Math.max(0, spanSecs - breakSecs) / 3600;

  async function save() {
    setErr(null);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      setErr("Kontrolli kuupäeva ja kellaaegu.");
      return;
    }
    if (hours <= 0) {
      setErr("Vahetuse pikkus peab olema üle nulli.");
      return;
    }
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }

    const started = new Date(startMs).toISOString();
    const ended = new Date(endMs > startMs ? endMs : endMs + 86400000).toISOString();

    const { data, error } = await supabase
      .from("shifts")
      .insert({
        user_id: userId,
        company_id: companyId,
        started_at: started,
        ended_at: ended,
        break_seconds: breakSecs,
        status: "closed",
        source: "manual",
      })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      setErr("Salvestamine ebaõnnestus.");
      return;
    }

    await supabase.from("shift_edits").insert({
      shift_id: data.id,
      edited_by: user.id,
      field: "created",
      old_value: null,
      new_value: `manual ${hours.toFixed(2)} h`,
    });

    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:border-signal"
      >
        + Lisa tunnid käsitsi
      </button>
    );

  const input = "rounded-lg border border-border bg-bg px-2 py-1.5 text-sm";

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm">
      <div className="font-medium">Lisa tunnid käsitsi — {workerName}</div>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="block text-xs text-muted">Kuupäev</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label>
          <span className="block text-xs text-muted">Algus</span>
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label>
          <span className="block text-xs text-muted">Lõpp</span>
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label>
          <span className="block text-xs text-muted">Paus (min)</span>
          <input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className={`mt-1 w-20 ${input}`} />
        </label>
        <div className="pb-1.5">
          <span className="block text-xs text-muted">Tunnid</span>
          <span className="tabular font-semibold text-signal">{hours.toFixed(1)} h</span>
        </div>
      </div>
      {err && <p className="text-alert">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="rounded-lg bg-text px-4 py-1.5 font-semibold text-bg disabled:opacity-60">
          {busy ? "…" : "Lisa"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-1.5">
          Tühista
        </button>
      </div>
      <p className="text-xs text-muted">Käsitsi lisatud vahetusel GPS-punkte pole — see märgitakse logisse.</p>
    </div>
  );
}
