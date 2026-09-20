"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";
import { pricingUnit, validPricingConfig, type PricingType } from "@/lib/pricing";

export function WorkerAdmin({ worker }: { worker: Profile }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [rate, setRate] = useState(worker.hourly_rate != null ? String(worker.hourly_rate) : "");
  const [pricingType, setPricingType] = useState<PricingType>(worker.pricing_type ?? "hourly");
  const [unit, setUnit] = useState(worker.pricing_unit ?? "");
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  async function save() {
    const parsed = rate.trim() === "" ? null : parseFloat(rate.replace(",", "."));
    const validationError = validPricingConfig(pricingType, parsed, unit);
    if (validationError) return toast(validationError, "error");
    const { error } = await supabase
      .from("profiles")
      .update({
        hourly_rate: parsed,
        pricing_type: pricingType,
        pricing_unit: pricingType === "quantity" ? unit.trim() : null,
      })
      .eq("id", worker.id);
    if (error) return toast("Salvestamine ebaõnnestus.", "error");
    toast("Muudatused salvestati.");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    router.refresh();
  }

  async function exportData() {
    const res = await fetch(`/api/gdpr?user_id=${worker.id}`);
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${worker.last_name}_${worker.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteData() {
    setDeleting(true);
    const res = await fetch("/api/gdpr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: worker.id, confirmation: "DELETE" }),
    });
    setDeleting(false);
    if (res.ok) { toast("Töötaja kustutati."); router.push("/"); }
    else toast("Kustutamine ebaõnnestus.", "error");
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-display text-lg font-semibold">Haldus</h3>

      <label className="block">
        <span className="text-sm text-muted">Hinna tüüp</span>
        <select
          value={pricingType}
          onChange={(event) => setPricingType(event.target.value as PricingType)}
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-signal"
        >
          <option value="hourly">Tunnipõhine</option>
          <option value="area">m² põhine</option>
          <option value="quantity">Kogusepõhine</option>
        </select>
      </label>

      {pricingType === "quantity" && (
        <label className="block">
          <span className="text-sm text-muted">Ühik</span>
          <input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={24} placeholder="nt tk, kompl, kast, objekt" className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-signal" />
        </label>
      )}

      <label className="block">
        <span className="text-sm text-muted">Hind ({worker.currency}/{pricingUnit(pricingType, unit)})</span>
        <input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          inputMode="decimal"
          placeholder={pricingType === "hourly" ? "määramata → töötaja isiklik hinnang" : "0.00"}
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-signal"
        />
      </label>

      <button onClick={save} className="w-full rounded-lg bg-text py-2 font-semibold text-bg">
        {saved ? "Salvestatud ✓" : "Salvesta"}
      </button>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs text-muted">GDPR — õigus andmetele ja kustutamisele</p>
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="flex-1 rounded-lg border border-border py-2 text-sm hover:border-signal"
          >
            Ekspordi andmed
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="flex-1 rounded-lg border border-alert py-2 text-sm text-alert hover:bg-alert/10"
          >
            Kustuta töötaja
          </button>
        </div>
      </div>
      <ConfirmDialog open={confirming} title="Kustuta töötaja?" body={`${worker.first_name} ${worker.last_name} konto ja kõik seotud andmed kustutatakse jäädavalt.`} confirmLabel="Kustuta" busy={deleting} onConfirm={deleteData} onCancel={() => setConfirming(false)} />
    </div>
  );
}
