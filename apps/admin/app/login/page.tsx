"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useI18n, LangSwitcher } from "@/components/I18nProvider";
import { emailSuggestion, isValidEmail, normalizeEmail } from "@/lib/email";

export default function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  function showError(message: string) {
    setError(message);
    setShake((v) => v + 1);
  }

  function checkedEmail(): string | null {
    const clean = normalizeEmail(email);
    const suggestion = emailSuggestion(clean);
    if (suggestion) {
      showError(`${t("emailTypo")} ${suggestion}?`);
      return null;
    }
    if (!isValidEmail(clean)) {
      showError(t("emailInvalid"));
      return null;
    }
    return clean;
  }

  async function routeByRole() {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    router.push(p?.role === "admin" ? "/" : p?.role === "accountant" ? "/reports" : "/me");
    router.refresh();
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const cleanEmail = checkedEmail();
    if (!cleanEmail) { setBusy(false); return; }
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) { setBusy(false); return showError(t("errWrongCreds")); }
    await routeByRole(); setBusy(false);
  }

  async function resetPassword() {
    setError(null); setNotice(null);
    if (!email.trim()) return showError(t("enterEmailFirst"));
    const clean = checkedEmail();
    if (!clean) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/auth/callback?next=/set-password`,
    });
    if (error) return showError(t("errCreate"));
    setNotice(t("resetSent"));
  }

  const input = "control bg-bg px-4 py-3";
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="auth-card panel w-full max-w-sm space-y-5 p-5 shadow-xl shadow-black/5 sm:p-8">
        <LangSwitcher />
        <div>
          <h1 className="font-display text-2xl font-bold">Tööaeg</h1>
          <p className="mt-1 text-sm text-muted">{t("tagline")}</p>
        </div>

        <form onSubmit={signIn} className="space-y-4">
          <label><span className="field-label">{t("email")}</span><input className={input} autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label><span className="field-label">{t("password")}</span><input className={input} autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p key={shake} role="alert" className="error-shake rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">{notice}</p>}
          <button disabled={busy} className="btn-primary w-full">{busy ? `${t("signin")}…` : t("signin")}</button>
          <button type="button" onClick={resetPassword} className="w-full text-sm text-muted hover:text-signal">{t("forgotPassword")}</button>
          <p className="text-center text-xs text-muted">{t("accountByAdmin")}</p>
        </form>
        <Link href="/privacy" className="block text-center text-xs text-muted hover:text-signal">{t("privacyPolicy")}</Link>
      </div>
    </div>
  );
}
