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
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [resending, setResending] = useState(false);
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
    let res: Response;
    try {
      res = await fetch("/api/gdpr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: worker.id, confirmation: "DELETE" }),
      });
    } catch {
      setDeleting(false);
      setConfirming(false);
      return toast("Serveriga ei saadud ühendust. Kontrolli võrku ja proovi uuesti.", "error");
    }
    setDeleting(false);
    setConfirming(false);
    if (res.ok) { toast("Töötaja kustutati."); router.push("/"); }
    else toast((await res.text()) || "Kustutamine ebaõnnestus.", "error");
  }

  async function resendInvitation() {
    if (temporaryPassword.length < 10 || temporaryPassword.length > 128) {
      return toast("Ajutine parool peab sisaldama 10–128 tähemärki.", "error");
    }
    setResending(true);
    let response: Response;
    try {
      response = await fetch(`/api/workers/${worker.id}/invitation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: temporaryPassword }),
      });
    } catch {
      setResending(false);
      return toast("Serveriga ei saadud ühendust. Kontrolli võrku ja proovi uuesti.", "error");
    }
    setResending(false);
    if (!response.ok) return toast(await response.text(), "error");
    setTemporaryPassword("");
    toast("Uus ajutine parool salvestati ja kutse saadeti.");
  }

  return (
    <div className="panel-pad space-y-4">
      <h3 className="font-display text-lg font-semibold">Haldus</h3>

      <label className="block">
        <span className="text-sm text-muted">Hinna tüüp</span>
        <select
          value={pricingType}
          onChange={(event) => setPricingType(event.target.value as PricingType)}
          className="control mt-1 bg-bg"
        >
          <option value="hourly">Tunnipõhine</option>
          <option value="area">m² põhine</option>
          <option value="quantity">Kogusepõhine</option>
        </select>
      </label>

      {pricingType === "quantity" && (
        <label className="block">
          <span className="text-sm text-muted">Ühik</span>
          <input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={24} placeholder="nt tk, kompl, kast, objekt" className="control mt-1 bg-bg" />
        </label>
      )}

      <label className="block">
        <span className="text-sm text-muted">Hind ({worker.currency}/{pricingUnit(pricingType, unit)})</span>
        <input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          inputMode="decimal"
          placeholder={pricingType === "hourly" ? "määramata → töötaja isiklik hinnang" : "0.00"}
          className="control mt-1 bg-bg"
        />
      </label>

      <button onClick={save} className="btn-primary w-full">
        {saved ? "Salvestatud" : "Salvesta tasustamine"}
      </button>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium">Saada sisselogimiskutse uuesti</p>
        <p className="mt-1 text-xs text-muted">Määra uus ajutine parool. Kasutaja peab selle järgmisel sisselogimisel vahetama.</p>
        <label className="mt-3 block">
          <span className="field-label">Uus ajutine parool</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            className="control bg-bg"
          />
        </label>
        <button onClick={resendInvitation} disabled={resending || temporaryPassword.length < 10} className="btn-secondary mt-3 w-full">
          {resending ? "Saadan kutset…" : "Uuenda parool ja saada kutse"}
        </button>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs text-muted">GDPR — õigus andmetele ja kustutamisele</p>
        <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
          <button
            onClick={exportData}
            className="btn-secondary flex-1"
          >
            Ekspordi andmed
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="btn-danger flex-1"
          >
            Kustuta töötaja
          </button>
        </div>
      </div>
      <ConfirmDialog open={confirming} title="Kustuta töötaja?" body={`${worker.first_name} ${worker.last_name} konto ja kõik seotud andmed kustutatakse jäädavalt.`} confirmLabel="Kustuta" busy={deleting} onConfirm={deleteData} onCancel={() => setConfirming(false)} />
    </div>
  );
}
