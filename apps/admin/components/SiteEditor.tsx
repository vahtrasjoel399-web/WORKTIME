"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Site } from "@/lib/types";
import { useToast } from "./ToastProvider";

const empty = { name: "", address: "", description: "", status: "active" as Site["status"], lat: "", lng: "", radius_m: "150" };

// Admin RLS permits sites writes within the company, so this writes directly.
export function SiteEditor({ sites, assignmentCounts }: { sites: Site[]; assignmentCounts: Record<string, number> }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateErr, setLocateErr] = useState<string | null>(null);

  // Auto-attribution of punches needs the site's coordinates (D-016), and an
  // employer knows the address, not the decimals — so look them up from it.
  async function locate() {
    if (!form.address.trim()) {
      setLocateErr("Sisesta enne aadress.");
      return;
    }
    setLocating(true);
    setLocateErr(null);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(form.address)}`,
      );
      const hit = (await r.json())?.[0];
      if (!hit) setLocateErr("Sellist aadressi ei leitud.");
      else setForm((f) => ({ ...f, lat: Number(hit.lat).toFixed(6), lng: Number(hit.lon).toFixed(6) }));
    } catch {
      setLocateErr("Otsing ebaõnnestus.");
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    const name = form.name.trim();
    if (!name) return toast("Objekti nimi on kohustuslik.", "error");
    const radius = Number.parseInt(form.radius_m || "150", 10);
    if (!Number.isFinite(radius) || radius < 10 || radius > 10000) {
      return toast("Raadius peab olema 10–10000 meetrit.", "error");
    }
    const lat = form.lat ? Number.parseFloat(form.lat) : null;
    const lng = form.lng ? Number.parseFloat(form.lng) : null;
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      return toast("Kontrolli laiuskraadi.", "error");
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      return toast("Kontrolli pikkuskraadi.", "error");
    }
    const payload = {
      name,
      address: form.address.trim() || null,
      description: form.description.trim() || null,
      status: form.status,
      lat,
      lng,
      radius_m: radius,
    };
    setBusy(true);
    let error = null;
    if (editing) {
      ({ error } = await supabase.from("sites").update(payload).eq("id", editing));
    } else {
      // company_id is filled from the admin's profile by RLS check; fetch it once
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) {
        setBusy(false);
        return toast("Sessioon aegus. Logi uuesti sisse.", "error");
      }
      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", me.user!.id).single();
      if (!prof) {
        setBusy(false);
        return toast("Ettevõtet ei leitud.", "error");
      }
      ({ error } = await supabase.from("sites").insert({ ...payload, company_id: prof.company_id }));
    }
    setBusy(false);
    if (error) return toast("Objekti salvestamine ebaõnnestus.", "error");
    setForm(empty);
    setEditing(null);
    toast(editing ? "Objekti andmed uuendati." : "Objekt lisati.");
    router.refresh();
  }

  async function toggleStatus(site: Site) {
    const nextStatus: Site["status"] = site.status === "active" ? "inactive" : "active";
    setBusy(true);
    const { error } = await supabase.from("sites").update({ status: nextStatus }).eq("id", site.id);
    setBusy(false);
    if (error) return toast("Objekti staatuse muutmine ebaõnnestus.", "error");
    toast(nextStatus === "active" ? "Objekt aktiveeriti." : "Objekt deaktiveeriti.");
    router.refresh();
  }

  function edit(s: Site) {
    setEditing(s.id);
    setForm({
      name: s.name,
      address: s.address ?? "",
      description: s.description ?? "",
      status: s.status,
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
        <textarea className={`${input} min-h-24 resize-y`} placeholder="Kirjeldus (valikuline)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Site["status"] })}>
          <option value="active">Aktiivne</option>
          <option value="inactive">Mitteaktiivne</option>
        </select>
        <button
          onClick={locate}
          disabled={locating}
          className="w-full rounded-lg border border-border py-2 text-sm font-medium hover:border-signal disabled:opacity-60"
        >
          {locating ? "Otsin…" : "Leia koordinaadid aadressi järgi"}
        </button>
        {locateErr && <p className="text-sm text-alert">{locateErr}</p>}
        <div className="flex gap-2">
          <input className={input} placeholder="Laius (lat)" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
          <input className={input} placeholder="Pikkus (lng)" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
        </div>
        <input className={input} placeholder="Raadius (m)" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} />
        <p className="text-xs text-muted">
          Koordinaadid on vajalikud: nende järgi tuvastab süsteem ise, millisel objektil töötaja vahetust alustas.
        </p>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-text py-2 font-semibold text-bg disabled:opacity-60">
            {busy ? "Salvestan…" : editing ? "Salvesta" : "Lisa"}
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
          <div key={s.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/sites/${s.id}`} className="font-medium hover:text-signal">{s.name}</Link>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "active" ? "bg-live/10 text-live" : "bg-bg text-muted"}`}>
                    {s.status === "active" ? "Aktiivne" : "Mitteaktiivne"}
                  </span>
                </div>
                <div className="text-sm text-muted">
                  {s.address ?? "Aadress puudub"} · {assignmentCounts[s.id] ?? 0} töötajat
                </div>
                {s.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{s.description}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={`/sites/${s.id}`} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-signal">Ava</Link>
                <button onClick={() => edit(s)} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-signal disabled:opacity-60">
                  Muuda
                </button>
                <button onClick={() => toggleStatus(s)} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-signal disabled:opacity-60">
                  {s.status === "active" ? "Deaktiveeri" : "Aktiveeri"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {sites.length === 0 && <p className="text-muted">Objekte pole veel lisatud.</p>}
      </div>
    </div>
  );
}
