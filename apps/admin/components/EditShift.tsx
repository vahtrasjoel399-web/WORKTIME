"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { calculatePricingTotal, pricingUnit, type PricingType } from "@/lib/pricing";
import { money } from "@/lib/format";

interface ShiftLite {
  id: string;
  started_at: string;
  ended_at: string | null;
  break_seconds: number;
  status: "open" | "closed";
  pricing_type: PricingType;
  pricing_rate: number | null;
  quantity: number | null;
  unit: string | null;
  pricing_label?: string | null;
  client_pricing_rate?: number | null;
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
  const [pricingType, setPricingType] = useState<PricingType>(shift.pricing_type ?? "hourly");
  const [workLabel, setWorkLabel] = useState(shift.pricing_label ?? "");
  const [pricingRate, setPricingRate] = useState(shift.pricing_rate == null ? "" : String(shift.pricing_rate));
  const [quantity, setQuantity] = useState(shift.quantity == null ? "" : String(shift.quantity));
  const [unit, setUnit] = useState(shift.unit ?? "");
  const [clientRate, setClientRate] = useState(shift.client_pricing_rate == null ? "" : String(shift.client_pricing_rate));
  const [busy, setBusy] = useState(false);

  const newBreak = Math.max(0, parseInt(breakMin || "0", 10)) * 60;
  const before = workedHours(shift.started_at, shift.ended_at, shift.break_seconds);
  const after = workedHours(fromLocalInput(start), fromLocalInput(end), newBreak);
  const changed = after != null && before != null && Math.abs(after - before) > 0.004;
  const parsedRate = pricingRate.trim() === "" ? null : Number(pricingRate.replace(",", "."));
  const parsedQuantity = quantity.trim() === "" ? null : Number(quantity.replace(",", "."));
  const parsedClientRate = clientRate.trim() === "" ? null : Number(clientRate.replace(",", "."));
  const previewTotal = calculatePricingTotal({ pricingType, rate: parsedRate, workedSeconds: after == null ? null : Math.round(after * 3600), quantity: parsedQuantity });

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
    if ((parsedRate != null && (!Number.isFinite(parsedRate) || parsedRate < 0)) || (pricingType !== "hourly" && parsedRate == null)) return;
    if (pricingType !== "hourly" && (parsedQuantity == null || !Number.isFinite(parsedQuantity) || parsedQuantity < 0)) return;
    if (pricingType === "quantity" && !unit.trim()) return;
    if (!workLabel.trim()) return;
    if (parsedClientRate != null && (!Number.isFinite(parsedClientRate) || parsedClientRate < 0)) return;
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
    if (pricingType !== shift.pricing_type) edits.push({ field: "pricing_type", old_value: shift.pricing_type, new_value: pricingType });
    if (workLabel.trim() !== (shift.pricing_label ?? "")) edits.push({ field: "pricing_label", old_value: shift.pricing_label ?? null, new_value: workLabel.trim() });
    if (parsedRate !== shift.pricing_rate) edits.push({ field: "pricing_rate", old_value: shift.pricing_rate == null ? null : String(shift.pricing_rate), new_value: parsedRate == null ? null : String(parsedRate) });
    if (parsedQuantity !== shift.quantity) edits.push({ field: "quantity", old_value: shift.quantity == null ? null : String(shift.quantity), new_value: parsedQuantity == null ? null : String(parsedQuantity) });
    const nextUnit = pricingType === "hourly" ? null : pricingType === "area" ? "m²" : unit.trim();
    if (nextUnit !== shift.unit) edits.push({ field: "unit", old_value: shift.unit, new_value: nextUnit });
    if (parsedClientRate !== (shift.client_pricing_rate ?? null)) edits.push({ field: "client_pricing_rate", old_value: shift.client_pricing_rate == null ? null : String(shift.client_pricing_rate), new_value: parsedClientRate == null ? null : String(parsedClientRate) });

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
          pricing_type: pricingType,
          pricing_label: workLabel.trim(),
          pricing_rate: parsedRate,
          quantity: pricingType === "hourly" ? null : parsedQuantity,
          unit: nextUnit,
          client_pricing_rate: parsedClientRate,
          client_rate_id: parsedClientRate === shift.client_pricing_rate ? undefined : null,
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
          <div className="flex flex-col gap-1 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
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
        <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
          <span className="text-muted">Töö nimetus</span>
          <input value={workLabel} onChange={(event) => setWorkLabel(event.target.value)} maxLength={80} className="control min-w-0 bg-surface px-2 py-1 min-[380px]:w-36" />
        </label>
        <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
          <span className="text-muted">Hinna tüüp</span>
          <select value={pricingType} onChange={(event) => setPricingType(event.target.value as PricingType)} className="control min-w-0 bg-surface px-2 py-1">
            <option value="hourly">Tunnipõhine</option>
            <option value="area">m² põhine</option>
            <option value="quantity">Kogusepõhine</option>
          </select>
        </label>
        {pricingType === "quantity" && (
          <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
            <span className="text-muted">Ühik</span>
            <input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={24} className="control min-w-0 bg-surface px-2 py-1 min-[380px]:w-36" />
          </label>
        )}
        <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
          <span className="text-muted">Töötaja hind €/{pricingUnit(pricingType, unit)}</span>
          <input inputMode="decimal" value={pricingRate} onChange={(event) => setPricingRate(event.target.value)} className="control min-w-0 bg-surface px-2 py-1 min-[380px]:w-36" />
        </label>
        <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
          <span className="text-muted">Kliendi hind €/{pricingUnit(pricingType, unit)}</span>
          <input inputMode="decimal" value={clientRate} onChange={(event) => setClientRate(event.target.value)} placeholder="Määramata" className="control min-w-0 bg-surface px-2 py-1 min-[380px]:w-36" />
        </label>
        {pricingType !== "hourly" && (
          <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
            <span className="text-muted">Tehtud kogus</span>
            <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="control min-w-0 bg-surface px-2 py-1 min-[380px]:w-36" />
          </label>
        )}
        <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
          <span className="text-muted">Algus</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="control min-w-0 bg-surface px-2 py-1" />
        </label>
        <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
          <span className="text-muted">Lõpp</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="control min-w-0 bg-surface px-2 py-1" />
        </label>
        <label className="grid gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] min-[380px]:items-center min-[380px]:gap-2">
          <span className="text-muted">Paus (min)</span>
          <input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="control min-w-0 bg-surface px-2 py-1 min-[380px]:w-36" />
        </label>
      </div>

      <div className="text-right text-sm"><span className="text-muted">Kokku: </span><b className="tabular text-signal">{previewTotal == null ? "—" : money(previewTotal)}</b></div>

      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary flex-1">
          {busy ? "Salvestan…" : "Salvesta"}
        </button>
        <button onClick={() => setOpen(false)} className="btn-secondary flex-1">
          Tühista
        </button>
      </div>
      <p className="text-xs text-muted">Iga muudatus jääb logisse (kes, millal, mis väärtus oli).</p>
    </div>
  );
}
