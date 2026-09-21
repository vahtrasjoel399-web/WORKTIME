"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { calculatePricingTotal, pricingUnit, type PricingType } from "@/lib/pricing";
import { money } from "@/lib/format";

// Hours for a day the worker never clocked — forgot to press start, worked off
// the app, or the punch was thrown away as wrong. Written as source = 'manual'
// with an audit row, so a hand-entered shift is never mistaken for a GPS one.
export function AddShift({
  userId,
  companyId,
  workerName,
  defaultPricingType,
  defaultRate,
  defaultUnit,
  currency,
}: {
  userId: string;
  companyId: string;
  workerName: string;
  defaultPricingType: PricingType;
  defaultRate: number | null;
  defaultUnit: string | null;
  currency: string;
}) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("16:30");
  const [breakMin, setBreakMin] = useState("30");
  const [pricingType, setPricingType] = useState<PricingType>(defaultPricingType);
  const [rate, setRate] = useState(defaultRate == null ? "" : String(defaultRate));
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(defaultUnit ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startMs = Date.parse(`${date}T${from}`);
  const endMs = Date.parse(`${date}T${to}`);
  const breakSecs = Math.max(0, parseInt(breakMin || "0", 10)) * 60;
  // A shift that ends before it starts crossed midnight — count it into the next day.
  const spanSecs = Math.floor(((endMs > startMs ? endMs : endMs + 86400000) - startMs) / 1000);
  const hours = Math.max(0, spanSecs - breakSecs) / 3600;
  const parsedRate = rate.trim() === "" ? null : Number(rate.replace(",", "."));
  const parsedQuantity = quantity.trim() === "" ? null : Number(quantity.replace(",", "."));
  const previewTotal = calculatePricingTotal({
    pricingType,
    rate: parsedRate,
    workedSeconds: Math.round(hours * 3600),
    quantity: parsedQuantity,
  });

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
    if ((parsedRate != null && (!Number.isFinite(parsedRate) || parsedRate < 0)) || (pricingType !== "hourly" && parsedRate == null)) {
      setErr("Sisesta kehtiv hind.");
      return;
    }
    if (pricingType !== "hourly" && (parsedQuantity == null || !Number.isFinite(parsedQuantity) || parsedQuantity < 0)) {
      setErr("Sisesta tehtud kogus.");
      return;
    }
    if (pricingType === "quantity" && !unit.trim()) {
      setErr("Sisesta ühik.");
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
        pricing_type: pricingType,
        pricing_rate: parsedRate,
        quantity: pricingType === "hourly" ? null : parsedQuantity,
        unit: pricingType === "quantity" ? unit.trim() : pricingType === "area" ? "m²" : null,
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
      new_value: `manual ${hours.toFixed(2)} h · ${pricingType} · ${previewTotal?.toFixed(2) ?? "—"} EUR`,
    });

    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-secondary"
      >
        + Lisa töö käsitsi
      </button>
    );

  const input = "control bg-bg";

  return (
    <div className="panel-pad space-y-4 text-sm">
      <div className="font-medium">Lisa töö käsitsi — {workerName}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          <span className="block text-xs text-muted">Hinna tüüp</span>
          <select value={pricingType} onChange={(event) => setPricingType(event.target.value as PricingType)} className={`mt-1 w-full ${input}`}>
            <option value="hourly">Tunnipõhine</option>
            <option value="area">m² põhine</option>
            <option value="quantity">Kogusepõhine</option>
          </select>
        </label>
        {pricingType === "quantity" && (
          <label>
            <span className="block text-xs text-muted">Ühik</span>
            <input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={24} placeholder="tk, kompl, kast…" className={`mt-1 w-full ${input}`} />
          </label>
        )}
        <label>
          <span className="block text-xs text-muted">Hind €/{pricingUnit(pricingType, unit)}</span>
          <input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="0.00" className={`mt-1 w-full ${input}`} />
        </label>
        {pricingType !== "hourly" && (
          <label>
            <span className="block text-xs text-muted">{pricingType === "area" ? "Tehtud kogus (m²)" : `Kogus (${unit || "ühik"})`}</span>
            <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" className={`mt-1 w-full ${input}`} />
          </label>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          <input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <div className="col-span-2 rounded-lg bg-bg px-3 py-2 sm:col-span-4">
          <span className="block text-xs text-muted">Tunnid</span>
          <span className="tabular font-semibold text-signal">{hours.toFixed(1)} h</span>
        </div>
      </div>
      <div className="rounded-lg bg-bg px-3 py-2 text-right">
        <span className="text-xs text-muted">Kokku </span>
        <span className="tabular font-semibold text-signal">{previewTotal == null ? "—" : money(previewTotal, currency)}</span>
      </div>
      {err && <p className="text-alert">{err}</p>}
      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? "Lisan…" : "Lisa töö"}
        </button>
        <button onClick={() => setOpen(false)} className="btn-secondary">
          Tühista
        </button>
      </div>
      <p className="text-xs text-muted">Käsitsi lisatud vahetusel GPS-punkte pole — see märgitakse logisse.</p>
    </div>
  );
}
