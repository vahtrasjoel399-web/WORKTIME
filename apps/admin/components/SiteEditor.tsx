"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Site } from "@/lib/types";
import { useToast } from "./ToastProvider";
import { EmptyState, StatusBadge } from "./ui";

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

  const input = "control bg-bg";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="panel-pad space-y-4 self-start lg:sticky lg:top-24 lg:col-span-1">
        <div><h2 className="section-title">{editing ? "Muuda objekti" : "Lisa objekt"}</h2><p className="mt-1 text-sm text-muted">Objekti nimi ja aadress kuvatakse vahetustes ning aruannetes.</p></div>
        <label className="block"><span className="field-label">Objekti nimi</span><input className={input} placeholder="Näiteks Kesklinna büroo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block"><span className="field-label">Aadress</span><input className={input} placeholder="Tänav, linn" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label className="block"><span className="field-label">Kirjeldus <span className="font-normal text-muted">(valikuline)</span></span><textarea className={`${input} min-h-24 resize-y`} placeholder="Ligipääs, kontakt või muu oluline info" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="block"><span className="field-label">Staatus</span><select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Site["status"] })}>
          <option value="active">Aktiivne</option>
          <option value="inactive">Mitteaktiivne</option>
        </select></label>
        <button
          onClick={locate}
          disabled={locating}
          className="btn-secondary w-full"
        >
          {locating ? "Otsin…" : "Leia koordinaadid aadressi järgi"}
        </button>
        {locateErr && <p className="text-sm text-alert">{locateErr}</p>}
        <div className="grid grid-cols-2 gap-2">
          <label><span className="field-label">Laiuskraad</span><input className={input} inputMode="decimal" placeholder="59.437" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></label>
          <label><span className="field-label">Pikkuskraad</span><input className={input} inputMode="decimal" placeholder="24.745" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></label>
        </div>
        <label className="block"><span className="field-label">Tööpiirkonna raadius</span><div className="relative"><input className={`${input} pr-10`} inputMode="numeric" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">m</span></div></label>
        <p className="text-xs text-muted">
          Koordinaadid on vajalikud: nende järgi tuvastab süsteem ise, millisel objektil töötaja vahetust alustas.
        </p>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary flex-1">
            {busy ? "Salvestan…" : editing ? "Salvesta" : "Lisa"}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm(empty); }} className="btn-secondary">
              Tühista
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 lg:col-span-2">
        {sites.map((s) => (
          <div key={s.id} className="panel p-4 transition-colors hover:border-border-strong">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/sites/${s.id}`} className="font-medium hover:text-signal">{s.name}</Link>
                  <StatusBadge tone={s.status === "active" ? "live" : "neutral"}>{s.status === "active" ? "Aktiivne" : "Mitteaktiivne"}</StatusBadge>
                </div>
                <div className="text-sm text-muted">
                  {s.address ?? "Aadress puudub"} · {assignmentCounts[s.id] ?? 0} töötajat
                </div>
                {s.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{s.description}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={`/sites/${s.id}`} className="btn-secondary">Ava</Link>
                <button onClick={() => edit(s)} disabled={busy} className="btn-quiet">
                  Muuda
                </button>
                <button onClick={() => toggleStatus(s)} disabled={busy} className="btn-quiet">
                  {s.status === "active" ? "Deaktiveeri" : "Aktiveeri"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {sites.length === 0 && <EmptyState title="Objekte pole veel" description="Lisa esimene objekt, et määrata töötajaid ja tuvastada vahetuste asukohti." icon="site" />}
      </div>
    </div>
  );
}
