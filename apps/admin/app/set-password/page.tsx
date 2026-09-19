"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { LangSwitcher, useI18n } from "@/components/I18nProvider";

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(t("passwordUpdateFailed"));

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : { data: null };
    if (profile?.role === "admin") {
      router.replace("/");
      router.refresh();
      return;
    }
    setComplete(true);
  }

  const input = "w-full rounded-lg border border-border bg-bg px-4 py-3 outline-none focus:border-signal";
  if (complete) {
    return (
      <div className="flex min-h-[80dvh] items-center justify-center px-0 sm:px-4">
        <div className="auth-card w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-5 text-center shadow-xl shadow-black/5 sm:p-8">
          <LangSwitcher />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-live/10 text-2xl text-live">✓</div>
          <div>
            <h1 className="font-display text-2xl font-bold">{t("passwordSaved")}</h1>
            <p className="mt-2 text-sm text-muted">{t("workerReady")}</p>
          </div>
          <a href="tooaeg:///" className="block w-full rounded-lg bg-signal py-3 font-semibold text-[#0B1320]">
            {t("openMobileApp")}
          </a>
          <p className="text-xs text-muted">{t("mobileLoginHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80dvh] items-center justify-center px-0 sm:px-4">
      <form onSubmit={submit} className="auth-card w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-xl shadow-black/5 sm:p-8">
        <LangSwitcher />
        <div>
          <h1 className="font-display text-2xl font-bold">{t("setPassword")}</h1>
          <p className="mt-1 text-sm text-muted">{t("setPasswordHint")}</p>
        </div>
        <input className={input} type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("newPassword")} />
        <input className={input} type="password" autoComplete="new-password" minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t("confirmPassword")} />
        {error && <p role="alert" className="error-shake rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-text py-3 font-semibold text-bg disabled:opacity-60">{busy ? "…" : t("savePassword")}</button>
      </form>
    </div>
  );
}
