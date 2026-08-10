"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";

// Self-registered workers awaiting the employer's decision. Accept -> is_approved
// true (they can start clocking in). Reject -> delete their profile.
export function PendingWorkers({ pending }: { pending: Profile[] }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (pending.length === 0) return null;

  async function accept(id: string) {
    setBusy(id);
    await supabase.from("profiles").update({ is_approved: true, is_active: true }).eq("id", id);
    setBusy(null);
    router.refresh();
  }
  async function reject(id: string) {
    if (!confirm("Lükata taotlus tagasi ja kustutada see konto?")) return;
    setBusy(id);
    await supabase.from("profiles").delete().eq("id", id);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-signal/40 bg-signal/10 p-5">
      <h2 className="mb-1 font-display text-lg font-semibold text-signal">
        Uued taotlused ({pending.length})
      </h2>
      <p className="mb-4 text-sm text-muted">Töötajad registreerusid ettevõtte koodiga ja ootavad kinnitust.</p>
      <div className="space-y-2">
        {pending.map((w) => (
          <div key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3">
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
                className="rounded-lg bg-live px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Võta vastu
              </button>
              <button
                onClick={() => reject(w.id)}
                disabled={busy === w.id}
                className="rounded-lg border border-alert px-4 py-2 text-sm text-alert hover:bg-alert/10 disabled:opacity-60"
              >
                Lükka tagasi
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
