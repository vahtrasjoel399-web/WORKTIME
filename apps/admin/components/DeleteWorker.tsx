"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Deletes a worker (auth user + all their data, via the GDPR erasure endpoint).
export function DeleteWorker({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Kustutada ${name} ja kõik tema andmed jäädavalt?`)) return;
    setBusy(true);
    const res = await fetch("/api/gdpr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("Kustutamine ebaõnnestus.");
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      title="Kustuta"
      className="rounded-lg border border-border px-2 py-1 text-sm text-muted hover:border-alert hover:text-alert disabled:opacity-50"
    >
      {busy ? "…" : "🗑"}
    </button>
  );
}
