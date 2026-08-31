"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { emailSuggestion, isValidEmail } from "@/lib/email";

const empty = { first_name: "", last_name: "", email: "", phone: "", hourly_rate: "" };

export function AddWorker() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const suggestion = emailSuggestion(form.email);
    if (suggestion) { setBusy(false); return setError(`Kontrolli e-posti. Kas mõtlesid ${suggestion}?`); }
    if (!isValidEmail(form.email)) { setBusy(false); return setError("Kontrolli e-posti aadressi."); }
    const res = await fetch("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate.replace(",", ".")) : null,
      }),
    });
    setBusy(false);
    if (!res.ok) return setError(await res.text());
    setForm(empty);
    setSent(true);
    router.refresh();
  }

  const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-signal";

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg">
        + Lisa töötaja
      </button>
    );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold">{sent ? "Kutse saadetud" : "Lisa töötaja"}</h3>
        {sent ? (
          <>
            <p className="text-sm text-muted">Töötaja sai turvalise e-posti kutse, mille kaudu ta määrab ise parooli.</p>
            <button onClick={() => { setOpen(false); setSent(false); }} className="w-full rounded-lg bg-text py-2 font-semibold text-bg">Valmis</button>
          </>
        ) : (<>
        <div className="flex gap-2">
          <input className={input} placeholder="Eesnimi" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input className={input} placeholder="Perekonnanimi" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
        </div>
        <input className={input} placeholder="E-post" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={input} placeholder="Telefon (valikuline)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className={input} inputMode="decimal" placeholder="Tunnitasu (valikuline)" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
        {error && <p className="text-sm text-alert">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-text py-2 font-semibold text-bg disabled:opacity-60">
            {busy ? "…" : "Loo konto"}
          </button>
          <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4">
            Tühista
          </button>
        </div>
        <p className="text-xs text-muted">Saadame töötajale kutse. Parooli määrab töötaja ise — seda ei pea sõnumiga jagama.</p>
        </>)}
      </div>
    </div>
  );
}
