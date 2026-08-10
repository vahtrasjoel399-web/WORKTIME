"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Mode = "signin" | "create";

export default function Login() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError("Vale e-post või parool.");
    router.push("/");
    router.refresh();
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data: signUp, error: signErr } = await supabase.auth.signUp({ email, password });
    if (signErr) {
      setBusy(false);
      return setError(signErr.message.includes("already") ? "Selle e-postiga konto on juba olemas." : "Registreerimine ebaõnnestus.");
    }
    const { data: code, error: rpcErr } = await supabase.rpc("register_company", {
      company_name: company,
      admin_first: firstName,
      admin_last: lastName,
    });
    setBusy(false);
    if (rpcErr) return setError("Ettevõtte loomine ebaõnnestus. Proovi uuesti.");
    if (!signUp.session) {
      // email confirmation on — show the code and ask to confirm + sign in
      setJoinCode(code as string);
      return;
    }
    setJoinCode(code as string);
  }

  // success screen: show the join code to hand out to workers
  if (joinCode) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="font-display text-2xl font-bold">Ettevõte loodud 🎉</h1>
          <p className="text-sm text-muted">Jaga seda koodi töötajatega — nad sisestavad selle registreerumisel.</p>
          <div className="tabular rounded-xl border border-signal/40 bg-signal/10 py-6 text-4xl font-bold tracking-[0.3em] text-signal">
            {joinCode}
          </div>
          <button onClick={() => { router.push("/"); router.refresh(); }} className="w-full rounded-lg bg-text py-3 font-semibold text-bg">
            Ava töölaud →
          </button>
        </div>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-border bg-bg px-4 py-3 outline-none focus:border-signal";

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-8">
        <div>
          <h1 className="font-display text-2xl font-bold">Tööandja töölaud</h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "signin" ? "Logi sisse oma kontoga." : "Loo ettevõte ja saa administraatoriks."}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg bg-bg p-1 text-sm">
          <button onClick={() => { setMode("signin"); setError(null); }} className={`flex-1 rounded-md py-2 ${mode === "signin" ? "bg-surface font-medium" : "text-muted"}`}>
            Logi sisse
          </button>
          <button onClick={() => { setMode("create"); setError(null); }} className={`flex-1 rounded-md py-2 ${mode === "create" ? "bg-surface font-medium" : "text-muted"}`}>
            Loo ettevõte
          </button>
        </div>

        {mode === "signin" ? (
          <form onSubmit={signIn} className="space-y-4">
            <input className={input} placeholder="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={input} placeholder="Parool" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm text-alert">{error}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-text py-3 font-semibold text-bg disabled:opacity-60">
              {busy ? "…" : "Logi sisse"}
            </button>
          </form>
        ) : (
          <form onSubmit={createCompany} className="space-y-4">
            <input className={input} placeholder="Ettevõtte nimi" value={company} onChange={(e) => setCompany(e.target.value)} />
            <div className="flex gap-2">
              <input className={input} placeholder="Eesnimi" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <input className={input} placeholder="Perekonnanimi" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <input className={input} placeholder="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={input} placeholder="Parool" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm text-alert">{error}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-text py-3 font-semibold text-bg disabled:opacity-60">
              {busy ? "…" : "Loo ettevõte"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
