"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { pricingUnit, type PricingType } from "@/lib/pricing";
import { money } from "@/lib/format";
import type { SiteClientRate } from "@/lib/types";
import { useToast } from "./ToastProvider";

export function SiteClientRates({ companyId, siteId, currency, rates }: { companyId: string; siteId: string; currency: string; rates: SiteClientRate[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<PricingType>("hourly");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));

  async function add() {
    const amount = Number(rate.replace(",", "."));
    const nextUnit = type === "hourly" ? null : type === "area" ? "m²" : unit.trim();
    if (!label.trim() || !Number.isFinite(amount) || amount < 0 || (type === "quantity" && !nextUnit)) {
      return toast("Kontrolli töö nimetust, hinda ja ühikut.", "error");
    }
    setBusy(true);
    const { data: { user } } = await supabaseBrowser().auth.getUser();
    const { error } = await supabaseBrowser().from("site_client_rates").insert({
      company_id: companyId, site_id: siteId, label: label.trim(), pricing_type: type,
      unit: nextUnit, rate: amount, currency, effective_from: from, created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast("Kliendihinna salvestamine ebaõnnestus.", "error");
    setLabel(""); setRate("");
    toast("Kliendihind lisati. Uued tööd kasutavad seda hinda.");
    router.refresh();
  }

  async function toggle(item: SiteClientRate) {
    setBusy(true);
    const { error } = await supabaseBrowser().from("site_client_rates").update({ is_active: !item.is_active }).eq("id", item.id);
    setBusy(false);
    if (error) return toast("Hinna muutmine ebaõnnestus.", "error");
    toast(item.is_active ? "Kliendihind lõpetati. Varasemad tööd ei muutu." : "Kliendihind aktiveeriti.");
    router.refresh();
  }

  return <section className="space-y-3">
    <div><h2 className="font-display text-xl font-semibold">Kliendi hinnad</h2><p className="mt-1 text-sm text-muted">Töö nimetus, tüüp ja ühik peavad vastama töötaja töö liigile. Hind salvestatakse lõpetatud töö juurde ega muutu hiljem.</p></div>
    <div className="panel-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <label><span className="field-label">Töö nimetus</span><input className="control bg-bg" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Paigaldus" /></label>
      <label><span className="field-label">Arvestus</span><select className="control bg-bg" value={type} onChange={(e) => { const next = e.target.value as PricingType; setType(next); setUnit(next === "area" ? "m²" : ""); }}><option value="hourly">€/h</option><option value="area">€/m²</option><option value="quantity">Muu ühik</option></select></label>
      {type === "quantity" ? <label><span className="field-label">Ühik</span><input className="control bg-bg" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="tk, jm, komplekt" maxLength={24} /></label> : <div className="hidden lg:block"><span className="field-label">Ühik</span><div className="control bg-elevated text-muted">{pricingUnit(type, unit)}</div></div>}
      <label><span className="field-label">Kliendi hind ({currency}/{pricingUnit(type, unit)})</span><input className="control bg-bg" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" /></label>
      <label><span className="field-label">Kehtib alates</span><input type="date" className="control bg-bg" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <button className="btn-primary sm:col-span-2 lg:col-span-5" disabled={busy} onClick={() => void add()}>{busy ? "Salvestan…" : "Lisa kliendihind"}</button>
    </div>
    <div className="grid gap-2 md:grid-cols-2">
      {rates.map((item) => <div key={item.id} className="panel flex items-start justify-between gap-3 p-4"><div><div className="font-medium">{item.label}</div><div className="text-sm text-muted">{money(item.rate, item.currency)}/{pricingUnit(item.pricing_type, item.unit)} · alates {new Date(`${item.effective_from}T00:00:00`).toLocaleDateString("et-EE")}</div><div className={`mt-1 text-xs ${item.is_active ? "text-live" : "text-muted"}`}>{item.is_active ? "Aktiivne" : "Lõpetatud"}</div></div><button className="btn-quiet shrink-0" disabled={busy} onClick={() => void toggle(item)}>{item.is_active ? "Lõpeta" : "Aktiveeri"}</button></div>)}
      {!rates.length && <p className="panel p-4 text-sm text-muted md:col-span-2">Kliendihindu pole veel lisatud. Ilma kliendihinnata tööd märgitakse Aruandes kontrollimiseks.</p>}
    </div>
  </section>;
}
