"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { money } from "@/lib/format";
import { pricingUnit, type PricingType } from "@/lib/pricing";
import type { MonthlyAdjustment, Site, WorkerRate } from "@/lib/types";
import { useToast } from "./ToastProvider";

export function WorkerCompensation({ employeeId, companyId, currency, sites, rates, adjustments }: {
  employeeId: string; companyId: string; currency: string; sites: Site[];
  rates: WorkerRate[]; adjustments: MonthlyAdjustment[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<PricingType>("hourly");
  const [label, setLabel] = useState("Tunnitöö");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [siteId, setSiteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function changeType(next: PricingType) {
    setType(next);
    setUnit(next === "area" ? "m²" : next === "hourly" ? "" : unit || "tk");
    if (label === "Tunnitöö" || label === "Pindala" || label === "Tükitöö") {
      setLabel(next === "hourly" ? "Tunnitöö" : next === "area" ? "Pindala" : "Tükitöö");
    }
  }

  async function addRate() {
    const value = Number(rate.replace(",", "."));
    if (!label.trim() || !Number.isFinite(value) || value < 0 || (type === "quantity" && !unit.trim())) return toast("Kontrolli nimetust, hinda ja ühikut.", "error");
    setBusy(true);
    const { error } = await supabaseBrowser().from("worker_rates").insert({
      company_id: companyId, employee_id: employeeId, site_id: siteId || null,
      label: label.trim(), pricing_type: type, unit: type === "hourly" ? null : type === "area" ? "m²" : unit.trim(),
      rate: value, currency, is_net: true,
    });
    setBusy(false);
    if (error) return toast("Hinna lisamine ebaõnnestus.", "error");
    setRate(""); toast("Netohind lisati."); router.refresh();
  }

  async function toggleRate(item: WorkerRate) {
    const { error } = await supabaseBrowser().from("worker_rates").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) return toast("Hinna muutmine ebaõnnestus.", "error");
    router.refresh();
  }

  async function addAdjustment() {
    const value = Number(amount.replace(",", "."));
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(value) || !note.trim()) return toast("Sisesta kuu, summa ja selgitus.", "error");
    setBusy(true);
    const { error } = await supabaseBrowser().from("monthly_adjustments").insert({
      company_id: companyId, employee_id: employeeId, site_id: siteId || null,
      period_month: `${month}-01`, amount: value, currency, is_net: true, note: note.trim(),
    });
    setBusy(false);
    if (error) return toast("Kuu summa lisamine ebaõnnestus.", "error");
    setAmount(""); setNote(""); toast("Kuu netosumma lisati."); router.refresh();
  }

  return <div className="panel-pad space-y-5">
    <div><h3 className="font-display text-lg font-semibold">Tasustamine</h3><p className="mt-1 text-sm text-muted">Lisa mitu netohinda. Objektita hind kehtib kõigil objektidel.</p></div>
    <div className="space-y-2">
      {rates.length === 0 ? <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">Aktiivseid lisahindu pole.</p> : rates.map((item) => {
        const site = sites.find((candidate) => candidate.id === item.site_id);
        return <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-bg p-3">
          <div className="min-w-0"><div className="font-medium">{item.label}</div><div className="text-sm text-muted">{money(item.rate, item.currency)}/{pricingUnit(item.pricing_type, item.unit)} neto · {site?.name ?? "Kõik objektid"}</div></div>
          <button onClick={() => void toggleRate(item)} className="btn-quiet shrink-0 text-xs">{item.is_active ? "Peata" : "Aktiveeri"}</button>
        </div>;
      })}
    </div>
    <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
      <label><span className="field-label">Nimetus</span><input className="control bg-bg" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label><span className="field-label">Hinna tüüp</span><select className="control bg-bg" value={type} onChange={(e) => changeType(e.target.value as PricingType)}><option value="hourly">Tund</option><option value="area">m²</option><option value="quantity">Muu kogus</option></select></label>
      {type === "quantity" && <label><span className="field-label">Ühik</span><input className="control bg-bg" value={unit} maxLength={24} placeholder="tk, jm, m, komplekt" onChange={(e) => setUnit(e.target.value)} /></label>}
      <label><span className="field-label">Netohind ({currency}/{pricingUnit(type, unit)})</span><input className="control bg-bg" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      <label className="sm:col-span-2"><span className="field-label">Objekt</span><select className="control bg-bg" value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">Kõik objektid</option>{sites.filter((s) => s.status === "active").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <button disabled={busy} onClick={() => void addRate()} className="btn-primary sm:col-span-2">Lisa netohind</button>
    </div>

    <div className="space-y-3 border-t border-border pt-4">
      <div><h4 className="font-medium">Kuu lisasumma</h4><p className="text-xs text-muted">Eraldi kanne, mida ei segata tundide ega kogustega.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="field-label">Kuu</span><input type="month" className="control bg-bg" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <label><span className="field-label">Netosumma ({currency})</span><input className="control bg-bg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="sm:col-span-2"><span className="field-label">Selgitus</span><input className="control bg-bg" maxLength={500} placeholder="nt objekti boonus või kokkulepitud kuutasu" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button disabled={busy} onClick={() => void addAdjustment()} className="btn-secondary sm:col-span-2">Lisa kuu summa</button>
      </div>
      {adjustments.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate text-muted">{item.period_month.slice(0, 7)} · {item.note}</span><b className="tabular shrink-0">{money(item.amount, item.currency)} neto</b></div>)}
    </div>
  </div>;
}
