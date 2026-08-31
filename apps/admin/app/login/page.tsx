"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useI18n, LangSwitcher } from "@/components/I18nProvider";
import { emailSuggestion, isValidEmail, normalizeEmail } from "@/lib/email";

type Mode = "signin" | "worker" | "company";

export default function Login() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    router.push(p?.role === "admin" ? "/" : "/me");
    router.refresh();
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const cleanEmail = checkedEmail();
    if (!cleanEmail) { setBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) { setBusy(false); return showError(t("errWrongCreds")); }
    await routeByRole(); setBusy(false);
  }

  async function registerWorker(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const cleanEmail = checkedEmail();
    if (!cleanEmail) { setBusy(false); return; }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data: su, error: se } = await supabase.auth.signUp({
      email: cleanEmail, password,
      options: { emailRedirectTo: redirectTo, data: { registration_kind: "worker", join_code: code.trim().toUpperCase(), first_name: first.trim(), last_name: last.trim() } },
    });
    if (se) { setBusy(false); return showError(se.message.includes("already") ? t("errExists") : t("errCreate")); }
    if (!su.session) { setBusy(false); setNotice(t("confirmEmail")); return; }
    const { error: re } = await supabase.rpc("register_worker", { p_join_code: code.trim(), worker_first: first.trim(), worker_last: last.trim() });
    if (re) { setBusy(false); return showError(re.message.includes("invalid") ? t("errBadCode") : t("errRegister")); }
    router.push("/me"); router.refresh(); setBusy(false);
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const cleanEmail = checkedEmail();
    if (!cleanEmail) { setBusy(false); return; }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data: su, error: se } = await supabase.auth.signUp({
      email: cleanEmail, password,
      options: { emailRedirectTo: redirectTo, data: { registration_kind: "company", company_name: company.trim(), first_name: first.trim(), last_name: last.trim() } },
    });
    if (se) { setBusy(false); return showError(se.message.includes("already") ? t("errExists") : t("errCreate")); }
    if (!su.session) { setBusy(false); setNotice(t("confirmEmail")); return; }
    const { data: c, error: re } = await supabase.rpc("register_company", { company_name: company.trim(), admin_first: first.trim(), admin_last: last.trim() });
    setBusy(false);
    if (re) return showError(t("errCompany"));
    setJoinCode(c as string);
  }

  async function resetPassword() {
    setError(null); setNotice(null);
    if (!email.trim()) return showError(t("enterEmailFirst"));
    const clean = checkedEmail();
    if (!clean) return;
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/auth/callback?next=/set-password`,
    });
    if (error) return showError(t("errCreate"));
    setNotice(t("resetSent"));
  }

  if (joinCode) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="font-display text-2xl font-bold">{t("companyCreated")}</h1>
          <p className="text-sm text-muted">{t("shareCode")}</p>
          <div className="tabular rounded-xl border border-signal/40 bg-signal/10 py-6 text-4xl font-bold tracking-[0.3em] text-signal">{joinCode}</div>
          <button onClick={() => { router.push("/"); router.refresh(); }} className="w-full rounded-lg bg-text py-3 font-semibold text-bg">{t("openPanel")}</button>
        </div>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-border bg-bg px-4 py-3 outline-none focus:border-signal";
  const tab = (m: Mode, label: string) => (
    <button onClick={() => { setMode(m); setError(null); }} className={`flex-1 rounded-md py-2 text-sm ${mode === m ? "bg-surface font-medium" : "text-muted"}`}>{label}</button>
  );

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="auth-card w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-xl shadow-black/5 sm:p-8">
        <LangSwitcher />
        <div>
          <h1 className="font-display text-2xl font-bold">Tööaeg</h1>
          <p className="mt-1 text-sm text-muted">{t("tagline")}</p>
        </div>

        <div className="flex gap-1 rounded-lg bg-bg p-1">
          {tab("signin", t("tabSignin"))}
          {tab("worker", t("tabWorker"))}
          {tab("company", t("tabCompany"))}
        </div>

        {mode === "signin" && (
          <form onSubmit={signIn} className="space-y-4">
            <input className={input} placeholder={t("email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={input} placeholder={t("password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p key={shake} role="alert" className="error-shake rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
            {notice && <p role="status" className="rounded-lg border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">{notice}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-text py-3 font-semibold text-bg disabled:opacity-60">{busy ? "…" : t("signin")}</button>
            <button type="button" onClick={resetPassword} className="w-full text-sm text-muted hover:text-signal">{t("forgotPassword")}</button>
            <p className="text-center text-xs text-muted">{t("autoRole")}</p>
          </form>
        )}

        {mode === "worker" && (
          <form onSubmit={registerWorker} className="space-y-4">
            <div className="flex gap-2">
              <input className={input} placeholder={t("firstName")} value={first} onChange={(e) => setFirst(e.target.value)} />
              <input className={input} placeholder={t("lastName")} value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <input className={input} placeholder={t("email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={input} placeholder={t("password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <input className={`${input} tracking-[0.3em] uppercase`} placeholder={t("companyCode")} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            {error && <p key={shake} role="alert" className="error-shake rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
            {notice && <p role="status" className="rounded-lg border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">{notice}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-signal py-3 font-semibold text-[#0B1320] disabled:opacity-60">{busy ? "…" : t("createWorker")}</button>
            <p className="text-center text-xs text-muted">{t("codeFromEmployer")}</p>
          </form>
        )}

        {mode === "company" && (
          <form onSubmit={createCompany} className="space-y-4">
            <input className={input} placeholder={t("companyName")} value={company} onChange={(e) => setCompany(e.target.value)} />
            <div className="flex gap-2">
              <input className={input} placeholder={t("firstName")} value={first} onChange={(e) => setFirst(e.target.value)} />
              <input className={input} placeholder={t("lastName")} value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <input className={input} placeholder={t("email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={input} placeholder={t("password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p key={shake} role="alert" className="error-shake rounded-lg border border-alert/30 bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
            {notice && <p role="status" className="rounded-lg border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">{notice}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-text py-3 font-semibold text-bg disabled:opacity-60">{busy ? "…" : t("createCompany")}</button>
          </form>
        )}
      </div>
    </div>
  );
}
