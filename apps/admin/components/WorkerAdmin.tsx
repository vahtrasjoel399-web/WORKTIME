"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Profile, Site } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

export function WorkerAdmin({ worker, sites }: { worker: Profile & { default_site_id: string | null }; sites: Site[] }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [rate, setRate] = useState(worker.hourly_rate != null ? String(worker.hourly_rate) : "");
  const [siteId, setSiteId] = useState(worker.default_site_id ?? "");
  const [active, setActive] = useState(worker.is_active);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  async function save() {
    const parsed = rate.trim() === "" ? null : parseFloat(rate.replace(",", "."));
    const { error } = await supabase
      .from("profiles")
      .update({
        hourly_rate: parsed,
        default_site_id: siteId || null,
        is_active: active,
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
        <span className="text-sm text-muted">Tunnitasu ({worker.currency}/h)</span>
        <input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="määramata → töötaja isiklik hinnang"
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-signal"
        />
      </label>

      <label className="block">
        <span className="text-sm text-muted">Objekt</span>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-signal"
        >
          <option value="">— määramata —</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span className="text-sm">Aktiivne konto</span>
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
