"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

// Self-registered workers awaiting the employer's decision. Accept -> is_approved
// true (they can start clocking in). Reject -> server deletes both Auth user and profile.
export function PendingWorkers({ pending }: { pending: Profile[] }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Profile | null>(null);
  const toast = useToast();

  if (pending.length === 0) return null;

  async function accept(id: string) {
    setBusy(id);
    const { error } = await supabase.from("profiles").update({ is_approved: true, is_active: true }).eq("id", id);
    setBusy(null);
    if (error) return toast("Töötaja kinnitamine ebaõnnestus.", "error");
    toast("Töötaja lisati tiimi.");
    router.refresh();
  }
  async function reject(id: string) {
    setBusy(id);
    const res = await fetch("/api/workers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id, confirmation: "REJECT" }),
    });
    setBusy(null);
    setRejecting(null);
    if (!res.ok) return toast("Taotluse tagasilükkamine ebaõnnestus.", "error");
    toast("Taotlus lükati tagasi.");
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-signal/35 bg-signal/5 p-4 sm:p-5">
      <h2 className="mb-1 font-display text-lg font-semibold text-signal">
        Uued taotlused ({pending.length})
      </h2>
      <p className="mb-4 text-sm text-muted">Töötajad registreerusid ettevõtte koodiga ja ootavad kinnitust.</p>
      <div className="space-y-2">
        {pending.map((w) => (
          <div key={w.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">
                {w.first_name} {w.last_name}
              </div>
              <div className="text-sm text-muted">{w.phone ?? "—"}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => accept(w.id)}
                disabled={busy === w.id}
                className="btn bg-live text-white hover:bg-live/90"
              >
                Võta vastu
              </button>
              <button
                onClick={() => setRejecting(w)}
                disabled={busy === w.id}
                className="btn-danger"
              >
                Lükka tagasi
              </button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!rejecting} title="Lükka taotlus tagasi?" body={`${rejecting?.first_name ?? ""} konto eemaldatakse täielikult.`} confirmLabel="Lükka tagasi" busy={!!busy} onConfirm={() => rejecting && reject(rejecting.id)} onCancel={() => setRejecting(null)} />
    </section>
  );
}
