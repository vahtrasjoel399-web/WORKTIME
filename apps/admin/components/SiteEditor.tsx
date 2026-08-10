"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Site } from "@/lib/types";

const empty = { name: "", address: "", lat: "", lng: "", radius_m: "150" };

// Admin RLS permits sites writes within the company, so this writes directly.
export function SiteEditor({ sites }: { sites: Site[] }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);

  async function save() {
    const payload = {
      name: form.name,
      address: form.address || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
      radius_m: parseInt(form.radius_m || "150", 10),
    };
    if (editing) await supabase.from("sites").update(payload).eq("id", editing);
    else {
      // company_id is filled from the admin's profile by RLS check; fetch it once
      const { data: me } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", me.user!.id).single();
      await supabase.from("sites").insert({ ...payload, company_id: prof!.company_id });
    }
    setForm(empty);
    setEditing(null);
    router.refresh();
  }

  function edit(s: Site) {
    setEditing(s.id);
    setForm({
      name: s.name,
      address: s.address ?? "",
      lat: s.lat?.toString() ?? "",
      lng: s.lng?.toString() ?? "",
      radius_m: s.radius_m.toString(),
    });
  }

  const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-signal";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 lg:col-span-1">
        <h3 className="font-display font-semibold">{editing ? "Muuda objekti" : "Lisa objekt"}</h3>
        <input className={input} placeholder="Nimi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={input} placeholder="Aadress" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <div className="flex gap-2">
          <input className={input} placeholder="Laius (lat)" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
          <input className={input} placeholder="Pikkus (lng)" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
        </div>
        <input className={input} placeholder="Raadius (m)" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} />
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 rounded-lg bg-text py-2 font-semibold text-bg">
            {editing ? "Salvesta" : "Lisa"}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm(empty); }} className="rounded-lg border border-border px-4">
              Tühista
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 lg:col-span-2">
        {sites.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4">
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-muted">
                {s.address ?? "—"} · {s.lat?.toFixed(4)}, {s.lng?.toFixed(4)} · r={s.radius_m} m
              </div>
            </div>
            <button onClick={() => edit(s)} className="text-sm text-muted underline hover:text-signal">
              Muuda
            </button>
          </div>
        ))}
        {sites.length === 0 && <p className="text-muted">Objekte pole veel lisatud.</p>}
      </div>
    </div>
  );
}
