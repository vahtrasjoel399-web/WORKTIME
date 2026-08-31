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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError(t("passwordTooShort"));
    if (password !== confirm) return setError(t("passwordMismatch"));
    setBusy(true);
    const { error: updateError } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(t("passwordUpdateFailed"));
    router.replace("/");
    router.refresh();
  }

  const input = "w-full rounded-lg border border-border bg-bg px-4 py-3 outline-none focus:border-signal";
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
