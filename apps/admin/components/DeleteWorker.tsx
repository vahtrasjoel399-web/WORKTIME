"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

// Deletes a worker (auth user + all their data, via the GDPR erasure endpoint).
export function DeleteWorker({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  async function del() {
    setBusy(true);
    const res = await fetch("/api/gdpr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id, confirmation: "DELETE" }),
    });
    setBusy(false);
    setConfirming(false);
    if (res.ok) { toast(`${name} kustutati.`); router.refresh(); }
    else toast("Kustutamine ebaõnnestus.", "error");
  }

  return (
    <><button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true); }}
      disabled={busy}
      title="Kustuta"
      className="rounded-lg border border-border px-2 py-1 text-sm text-muted hover:border-alert hover:text-alert disabled:opacity-50"
    >
      {busy ? "…" : "🗑"}
    </button><ConfirmDialog open={confirming} title="Kustuta töötaja?" body={`${name} konto, vahetused ja seotud andmed kustutatakse jäädavalt. Seda tegevust ei saa tagasi võtta.`} confirmLabel="Kustuta" busy={busy} onConfirm={del} onCancel={() => setConfirming(false)} /></>
  );
}
