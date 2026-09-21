"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { LangSwitcher, useI18n } from "@/components/I18nProvider";
import { Icon } from "@/components/Icon";

export default function SetPasswordPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError(t("passwordTooShort"));
    if (password !== confirm) return setError(t("passwordMismatch"));
    setBusy(true);
    const supabase = supabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { force_password_change: false },
    });
    setBusy(false);
    if (updateError) return setError(t("passwordUpdateFailed"));

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : { data: null };
    if (profile?.role === "admin" || profile?.role === "accountant") {
      router.replace(profile.role === "accountant" ? "/reports" : "/");
      router.refresh();
      return;
    }
    setComplete(true);
  }

  const input = "control bg-bg px-4 py-3";
  if (complete) {
    return (
      <div className="flex min-h-[80dvh] items-center justify-center px-0 sm:px-4">
        <div className="auth-card panel w-full max-w-sm space-y-5 p-5 text-center shadow-xl shadow-black/5 sm:p-8">
          <LangSwitcher />
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-live/10 text-live"><Icon name="check" className="h-6 w-6" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold">{t("passwordSaved")}</h1>
            <p className="mt-2 text-sm text-muted">{t("workerReady")}</p>
          </div>
          <a href="tooaeg:///" className="btn-primary w-full">
            {t("openMobileApp")}
          </a>
          <p className="text-xs text-muted">{t("mobileLoginHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80dvh] items-center justify-center px-0 sm:px-4">
      <form onSubmit={submit} className="auth-card panel w-full max-w-sm space-y-5 p-5 shadow-xl shadow-black/5 sm:p-8">
        <LangSwitcher />
        <div>
          <h1 className="font-display text-2xl font-bold">{t("setPassword")}</h1>
          <p className="mt-1 text-sm text-muted">{t("setPasswordHint")}</p>
        </div>
        <label><span className="field-label">{t("newPassword")}</span><input className={input} type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label><span className="field-label">{t("confirmPassword")}</span><input className={input} type="password" autoComplete="new-password" minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error && <p role="alert" className="error-shake rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <button disabled={busy} className="btn-primary w-full">{busy ? `${t("savePassword")}…` : t("savePassword")}</button>
      </form>
    </div>
  );
}
