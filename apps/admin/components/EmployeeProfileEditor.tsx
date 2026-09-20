"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { employeeFileError, employeeStoragePath } from "@/lib/employee-files";
import { emailSuggestion, isValidEmail } from "@/lib/email";
import type { Profile } from "@/lib/types";
import { useToast } from "./ToastProvider";

export function EmployeeProfileEditor({ worker, photoUrl }: { worker: Profile; photoUrl: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const supabase = supabaseBrowser();
  const [form, setForm] = useState({
    first_name: worker.first_name,
    last_name: worker.last_name,
    email: worker.email ?? "",
    phone: worker.phone ?? "",
    position: worker.position ?? "",
    is_active: worker.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const initials = `${worker.first_name.charAt(0)}${worker.last_name.charAt(0)}`.toUpperCase() || "?";
  const inputClass = "control mt-1 bg-bg";

  async function save() {
    if (!form.first_name.trim() || !form.last_name.trim()) return toast("Nimi on kohustuslik.", "error");
    const suggestion = emailSuggestion(form.email);
    if (suggestion) return toast(`Kontrolli e-posti: ${suggestion}`, "error");
    if (!isValidEmail(form.email)) return toast("Kontrolli e-posti aadressi.", "error");

    setSaving(true);
    const response = await fetch(`/api/workers/${worker.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!response.ok) return toast((await response.text()) || "Salvestamine ebaõnnestus.", "error");
    toast("Töötaja andmed salvestati.");
    router.refresh();
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    const validationError = employeeFileError(file, "photos");
    if (validationError) return toast(validationError, "error");

    setUploadingPhoto(true);
    const path = employeeStoragePath(worker.company_id, worker.id, "photos", file);
    const { error: uploadError } = await supabase.storage
      .from("employee-files")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setUploadingPhoto(false);
      return toast("Foto üleslaadimine ebaõnnestus.", "error");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ profile_photo_path: path })
      .eq("id", worker.id);
    if (profileError) {
      await supabase.storage.from("employee-files").remove([path]);
      setUploadingPhoto(false);
      return toast("Foto salvestamine ebaõnnestus.", "error");
    }

    setUploadingPhoto(false);
    setPhotoFailed(false);
    toast(photoUrl ? "Profiilifoto asendati." : "Profiilifoto lisati.");
    router.refresh();
  }

  return (
    <section className="panel-pad space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">Isikuandmed</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs ${form.is_active ? "bg-live/10 text-live" : "bg-bg text-muted"}`}>
          {form.is_active ? "Aktiivne" : "Mitteaktiivne"}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {photoUrl && !photoFailed ? (
          <img
            src={photoUrl}
            alt={`${worker.first_name} ${worker.last_name}`}
            className="h-20 w-20 rounded-xl border border-border object-cover"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-bg font-display text-xl font-bold text-muted">
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <label className="inline-flex cursor-pointer rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-signal">
            {uploadingPhoto ? "Laadin…" : photoUrl ? "Asenda foto" : "Lisa foto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploadingPhoto}
              onChange={(event) => {
                void uploadPhoto(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p className="mt-1 text-xs text-muted">JPG, PNG või WebP · kuni 10 MB</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-muted">Eesnimi</span>
          <input className={inputClass} value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Perekonnanimi</span>
          <input className={inputClass} value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-muted">E-post</span>
        <input type="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-muted">Telefon</span>
        <input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-muted">Ametikoht</span>
        <input className={inputClass} value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} />
      </label>
      <label className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
        <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
        <span className="text-sm">Aktiivne töötaja</span>
      </label>
      <button onClick={save} disabled={saving} className="btn-primary w-full">
        {saving ? "Salvestan…" : "Salvesta isikuandmed"}
      </button>
    </section>
  );
}
