"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { emailSuggestion, isValidEmail } from "@/lib/email";
import { employeeFileError, employeeStoragePath } from "@/lib/employee-files";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Site } from "@/lib/types";
import { pricingUnit, validPricingConfig, type PricingType } from "@/lib/pricing";
import { useI18n } from "./I18nProvider";

const empty = {
  role: "worker" as "worker" | "accountant",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  position: "",
  initial_site_id: "",
  pricing_type: "hourly" as PricingType,
  pricing_unit: "",
  hourly_rate: "",
  password: "",
};

const CV_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function AddWorker({ sites, companyId, actorId }: { sites: Site[]; companyId: string; actorId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const supabase = supabaseBrowser();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [photo, setPhoto] = useState<File | null>(null);
  const [cv, setCv] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdRole, setCreatedRole] = useState<"worker" | "accountant">("worker");
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  async function uploadPhoto(employeeId: string, file: File): Promise<boolean> {
    const path = employeeStoragePath(companyId, employeeId, "photos", file);
    const { error: uploadError } = await supabase.storage
      .from("employee-files")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return false;
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ profile_photo_path: path })
      .eq("id", employeeId);
    if (profileError) {
      await supabase.storage.from("employee-files").remove([path]);
      return false;
    }
    return true;
  }

  async function uploadCv(employeeId: string, file: File): Promise<boolean> {
    const path = employeeStoragePath(companyId, employeeId, "documents", file);
    const { error: uploadError } = await supabase.storage
      .from("employee-files")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return false;
    const { error: metadataError } = await supabase.from("employee_documents").insert({
      company_id: companyId,
      employee_id: employeeId,
      filename: file.name.slice(0, 255),
      storage_path: path,
      document_type: "cv",
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: actorId,
    });
    if (metadataError) {
      await supabase.storage.from("employee-files").remove([path]);
      return false;
    }
    return true;
  }

  async function submit() {
    setError(null);
    if (!form.first_name.trim() || !form.last_name.trim()) return setError("Ees- ja perekonnanimi on kohustuslikud.");
    const suggestion = emailSuggestion(form.email);
    if (suggestion) return setError(`Kontrolli e-posti. Kas mõtlesid ${suggestion}?`);
    if (!isValidEmail(form.email)) return setError("Kontrolli e-posti aadressi.");
    if (form.password.length < 10) return setError("Ajutine parool peab olema vähemalt 10 tähemärki.");
    if (form.password.length > 128) return setError("Ajutine parool võib olla kuni 128 tähemärki.");
    if (form.role === "worker" && photo) {
      const photoError = employeeFileError(photo, "photos");
      if (photoError) return setError(photoError);
    }
    if (form.role === "worker" && cv) {
      const cvError = employeeFileError(cv, "documents");
      if (cvError) return setError(cvError);
      if (!CV_MIME_TYPES.has(cv.type)) return setError("CV peab olema PDF- või Word-fail.");
    }
    const parsedRate = form.role === "worker" && form.hourly_rate ? parseFloat(form.hourly_rate.replace(",", ".")) : null;
    if (form.role === "worker") {
      const pricingError = validPricingConfig(form.pricing_type, parsedRate, form.pricing_unit);
      if (pricingError) return setError(pricingError);
    }

    setBusy(true);
    const res = await fetch("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        hourly_rate: parsedRate,
      }),
    });
    if (!res.ok) {
      setBusy(false);
      return setError(await res.text());
    }
    const created = (await res.json()) as { id: string };
    const failedUploads: string[] = [];
    if (form.role === "worker" && photo && !(await uploadPhoto(created.id, photo))) failedUploads.push("profiilifoto");
    if (form.role === "worker" && cv && !(await uploadCv(created.id, cv))) failedUploads.push("CV");

    setBusy(false);
    setForm(empty);
    setPhoto(null);
    setCv(null);
    setCreatedId(created.id);
    setCreatedRole(form.role);
    setUploadWarning(failedUploads.length > 0 ? `${failedUploads.join(" ja ")} üleslaadimine ebaõnnestus. Lisa fail töötaja profiilil.` : null);
    setSent(true);
    router.refresh();
  }

  const input = "control bg-bg";

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        {t("addUser")}
      </button>
    );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-worker-title" className="dialog-in max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div><h3 id="add-worker-title" className="font-display text-lg font-semibold">{sent ? "Konto loodud" : t("addUser")}</h3>{!sent && <p className="mt-1 text-sm text-muted">Vali ligipääsutase, sisesta andmed ja määra ajutine parool.</p>}</div>
        {sent ? (
          <>
            <p className="text-sm text-muted">Konto on aktiivne. Anna kasutajale e-post ja ajutine parool turvalise kanali kaudu. Esimesel sisselogimisel peab ta parooli muutma.</p>
            {uploadWarning && <p className="rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-sm text-alert">{uploadWarning}</p>}
            <div className="grid grid-cols-2 gap-2">
              {createdId && createdRole === "worker" && <button onClick={() => router.push(`/workers/${createdId}`)} className="btn-secondary">Ava profiil</button>}
              <button onClick={() => { setOpen(false); setSent(false); setCreatedId(null); setUploadWarning(null); }} className="btn-primary">Valmis</button>
            </div>
          </>
        ) : (<>
        <fieldset>
          <legend className="field-label">{t("userRole")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["worker", "accountant"] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setForm({ ...form, role })}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${form.role === role ? "border-primary bg-primary/10 text-primary" : "border-border bg-bg hover:border-border-strong"}`}
                aria-pressed={form.role === role}
              >
                <span className="block font-medium">{role === "worker" ? t("employee") : t("accountant")}</span>
                <span className="mt-0.5 block text-xs text-muted">{role === "worker" ? t("workerAccess") : t("accountantAccess")}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="field-label">{t("firstName")}</span><input className={input} autoComplete="given-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
          <label><span className="field-label">{t("lastName")}</span><input className={input} autoComplete="family-name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
        </div>
        <label><span className="field-label">{t("email")}</span><input className={input} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label><span className="field-label">{t("temporaryPassword")}</span><input className={input} type="password" autoComplete="new-password" minLength={10} maxLength={128} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><span className="field-hint block">Vähemalt 10 tähemärki. Kasutaja peab selle esimesel sisselogimisel muutma.</span></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="field-label">Telefon <span className="font-normal text-muted">(valikuline)</span></span><input className={input} type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label><span className="field-label">Ametikoht <span className="font-normal text-muted">(valikuline)</span></span><input className={input} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></label>
        </div>
        {form.role === "worker" && <><label><span className="field-label">Esialgne objekt <span className="font-normal text-muted">(valikuline)</span></span><select className={input} value={form.initial_site_id} onChange={(e) => setForm({ ...form, initial_site_id: e.target.value })}>
          <option value="">Objekti ei määrata</option>
          {sites.filter((site) => site.status === "active").map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select></label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Hinna tüüp</span>
          <select className={input} value={form.pricing_type} onChange={(e) => setForm({ ...form, pricing_type: e.target.value as PricingType, pricing_unit: e.target.value === "area" ? "m²" : form.pricing_unit })}>
            <option value="hourly">Tunnipõhine</option>
            <option value="area">m² põhine</option>
            <option value="quantity">Kogusepõhine</option>
          </select>
        </label>
        {form.pricing_type === "quantity" && (
          <label><span className="field-label">Ühik</span><input className={input} maxLength={24} placeholder="nt tk, komplekt või kast" value={form.pricing_unit} onChange={(e) => setForm({ ...form, pricing_unit: e.target.value })} /></label>
        )}
        <label><span className="field-label">Hind <span className="font-normal text-muted">(valikuline)</span></span><div className="relative">
          <input className={`${input} pr-20`} inputMode="decimal" placeholder="0.00" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">€/{pricingUnit(form.pricing_type, form.pricing_unit)}</span>
        </div></label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="cursor-pointer rounded-lg border border-border bg-bg px-3 py-2 text-sm hover:border-signal">
            <span className="block text-xs text-muted">Profiilifoto</span>
            <span className="block truncate font-medium">{photo?.name ?? "Vali JPG, PNG või WebP"}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <label className="cursor-pointer rounded-lg border border-border bg-bg px-3 py-2 text-sm hover:border-signal">
            <span className="block text-xs text-muted">CV</span>
            <span className="block truncate font-medium">{cv?.name ?? "Vali PDF või Word"}</span>
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => setCv(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <p className="text-xs text-muted">Faili maksimaalne suurus on 10 MB.</p></>}
        {error && <p role="alert" className="rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={busy} className="btn-primary flex-1">
            {busy ? "Loon kontot…" : t("createAccount")}
          </button>
          <button onClick={() => setOpen(false)} className="btn-secondary">
            {t("cancel")}
          </button>
        </div>
        <p className="text-xs text-muted">Konto luuakse kohe. Jaga ajutist parooli kasutajaga turvaliselt.</p>
        </>)}
      </div>
    </div>
  );
}
