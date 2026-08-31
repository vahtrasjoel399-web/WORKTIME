"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { toggleTheme } from "./ThemeInit";
import { useI18n, LangSwitcher } from "./I18nProvider";
import { resolveEarnings } from "@/lib/report";
import { money, hours1 } from "@/lib/format";
import { isoWeek, weekDates, weekKey } from "@/lib/week";
import type { Profile } from "@/lib/types";

interface Shift {
  id: string;
  started_at: string;
  ended_at: string | null;
  break_seconds: number;
  status: "open" | "closed";
  worked_seconds?: number | null;
}

function hms(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

// Browser geolocation (point fixation only) + reverse geocode.
async function getFix(): Promise<{ lat: number; lng: number; acc: number | null; address: string | null }> {
  const pos = await new Promise<GeolocationPosition>((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 15000 }),
  );
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  let address: string | null = null;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`);
    address = (await r.json())?.display_name ?? null;
  } catch { /* ignore */ }
  return { lat, lng, acc: accuracy ?? null, address };
}

export function WorkerHome({
  profile,
  openShift,
  shifts,
  approved,
  hasConsent,
}: {
  profile: Profile;
  openShift: Shift | null;
  /** Closed shifts of the last few pay weeks, newest first. */
  shifts: Shift[];
  approved: boolean;
  hasConsent: boolean;
}) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const { t } = useI18n();

  const [shift, setShift] = useState<Shift | null>(openShift);
  const [phase, setPhase] = useState<"idle" | "running" | "onBreak">(openShift ? "running" : "idle");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState<"idle" | "getting" | "ok" | "denied">("idle");
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"shift" | "hours">("shift");
  const [rate, setRate] = useState(profile.self_hourly_rate != null ? String(profile.self_hourly_rate) : "");
  const [showEarn, setShowEarn] = useState(profile.show_earnings ?? true);
  const breakAccum = useRef(openShift?.break_seconds ?? 0);
  const breakStart = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setShift((s) => {
        if (s && phase === "running") {
          setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(s.started_at)) / 1000) - breakAccum.current));
        }
        return s;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (openShift) setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(openShift.started_at)) / 1000) - breakAccum.current));
  }, [openShift]);

  // ---- approval / consent gates ----
  if (!approved) {
    return (
      <Centered>
        <LangSwitcher />
        <div className="text-5xl">⏳</div>
        <h1 className="font-display text-2xl font-bold">{t("pendingTitle")}</h1>
        <p className="text-muted">{t("pendingBody")}</p>
        <div className="flex gap-2">
          <button onClick={() => router.refresh()} className="rounded-lg bg-text px-5 py-2.5 font-semibold text-bg">{t("checkAgain")}</button>
          <SignOut />
        </div>
      </Centered>
    );
  }
  if (!hasConsent) {
    return <Consent onDone={() => router.refresh()} userId={profile.id} />;
  }

  // ---- earnings ----
  // Wages are paid weekly (D-015), so the headline number is this Mon-Sun week;
  // the running timer counts into it live.
  const rateRes = resolveEarnings(seconds, profile.hourly_rate, profile.self_hourly_rate);
  const now = new Date();
  const thisWeekKey = weekKey(now);
  const thisMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const running = phase !== "idle" ? seconds : 0;

  const weekSeconds =
    shifts.reduce((a, s) => (weekKey(new Date(s.started_at)) === thisWeekKey ? a + (s.worked_seconds ?? 0) : a), 0) +
    running;
  const monthSeconds =
    shifts.reduce((a, s) => {
      const d = new Date(s.started_at);
      return d.getUTCFullYear() * 12 + d.getUTCMonth() === thisMonth ? a + (s.worked_seconds ?? 0) : a;
    }, 0) + running;
  const weekEarn = resolveEarnings(weekSeconds, profile.hourly_rate, profile.self_hourly_rate);
  const monthEarn = resolveEarnings(monthSeconds, profile.hourly_rate, profile.self_hourly_rate);

  // history grouped into pay weeks, newest first
  const byWeek: { key: string; label: string; seconds: number; rows: Shift[] }[] = [];
  for (const s of shifts) {
    const d = new Date(s.started_at);
    const key = weekKey(d);
    let bucket = byWeek.find((b) => b.key === key);
    if (!bucket) {
      bucket = { key, label: `${t("weekShort")}${isoWeek(d)} · ${weekDates(d)}`, seconds: 0, rows: [] };
      byWeek.push(bucket);
    }
    bucket.seconds += s.worked_seconds ?? 0;
    bucket.rows.push(s);
  }
  byWeek.sort((a, b) => b.key.localeCompare(a.key));

  async function start() {
    setBusy(true); setGps("getting");
    try {
      const f = await getFix();
      const { data, error } = await supabase
        .from("shifts")
        .insert({ user_id: profile.id, company_id: profile.company_id, started_at: new Date().toISOString(),
          start_lat: f.lat, start_lng: f.lng, start_accuracy_m: f.acc, start_address: f.address, break_seconds: 0, status: "open", source: "app" })
        .select("*").single();
      if (error) throw error;
      breakAccum.current = 0; breakStart.current = null;
      setShift(data as Shift); setPhase("running"); setSeconds(0); setGps("ok");
    } catch (e: any) {
      setGps(e?.code === 1 ? "denied" : "idle");
    } finally { setBusy(false); }
  }

  async function finish() {
    if (!shift) return;
    setBusy(true); setGps("getting");
    try {
      const f = await getFix();
      if (breakStart.current) { breakAccum.current += Math.floor((Date.now() - breakStart.current) / 1000); breakStart.current = null; }
      await supabase.from("shifts").update({ ended_at: new Date().toISOString(), end_lat: f.lat, end_lng: f.lng,
        end_accuracy_m: f.acc, end_address: f.address, break_seconds: breakAccum.current, status: "closed" }).eq("id", shift.id);
      setShift(null); setPhase("idle"); setSeconds(0); setGps("idle");
      router.refresh();
    } catch (e: any) {
      setGps(e?.code === 1 ? "denied" : "idle");
    } finally { setBusy(false); }
  }

  function toggleBreak() {
    if (phase === "running") { breakStart.current = Date.now(); setPhase("onBreak"); }
    else if (phase === "onBreak" && breakStart.current) {
      breakAccum.current += Math.floor((Date.now() - breakStart.current) / 1000); breakStart.current = null; setPhase("running");
    }
  }

  async function saveSettings() {
    const v = rate.trim() === "" ? null : parseFloat(rate.replace(",", "."));
    await supabase.from("profiles").update({ self_hourly_rate: v, show_earnings: showEarn }).eq("id", profile.id);
    setShowSettings(false);
    router.refresh();
  }

  const active = phase !== "idle";
  const target = (profile.target_shift_hours || 8) * 3600;
  const pct = Math.min(100, (seconds / target) * 100);

  return (
    <div className="mx-auto flex min-h-[85vh] max-w-md flex-col justify-between gap-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-xl font-bold">{profile.first_name}</div>
          <div className="text-sm text-muted">{active ? (phase === "onBreak" ? t("onBreak") : t("shiftRunning")) : t("notStarted")}</div>
        </div>
        <div className="flex items-center gap-2">
          {gps === "ok" && <span className="text-xs text-live">● GPS</span>}
          {gps === "getting" && <span className="text-xs text-muted">GPS…</span>}
          <button onClick={() => setShowSettings((s) => !s)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">⚙</button>
        </div>
      </div>

      {showSettings && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm">
          <LangSwitcher />
          {profile.hourly_rate != null ? (
            <div><span className="text-muted">{t("rateByEmployer")}: </span><b className="tabular">{money(profile.hourly_rate, profile.currency)}/{t("hoursUnit")}</b></div>
          ) : (
            <label className="block"><span className="text-muted">{t("yourRate")}</span>
              <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" /></label>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" checked={showEarn} onChange={(e) => setShowEarn(e.target.checked)} /> {t("showEarnings")}</label>
          <div className="flex gap-2">
            <button onClick={saveSettings} className="flex-1 rounded-lg bg-text py-2 font-semibold text-bg">{t("save")}</button>
            <button onClick={toggleTheme} className="rounded-lg border border-border px-3">◐ {t("theme")}</button>
          </div>
          <SignOut />
        </div>
      )}

      {/* tabs */}
      <div className="flex gap-1 rounded-lg bg-surface p-1">
        <button onClick={() => setView("shift")} className={`flex-1 rounded-md py-2 text-sm ${view === "shift" ? "bg-bg font-medium" : "text-muted"}`}>{t("tabShift")}</button>
        <button onClick={() => setView("hours")} className={`flex-1 rounded-md py-2 text-sm ${view === "hours" ? "bg-bg font-medium" : "text-muted"}`}>{t("tabHours")}</button>
      </div>

      {view === "shift" ? (
        <>
          {/* timer */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex h-64 w-64 items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="6" />
                <circle cx="50" cy="50" r="45" fill="none" stroke={active ? "var(--signal)" : "var(--text-muted)"} strokeWidth="6"
                  strokeLinecap="round" strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - pct / 100)}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }} />
              </svg>
              <div className={`tabular text-4xl font-semibold ${active ? "text-signal" : "text-text"}`}>{hms(seconds)}</div>
            </div>

            {active && showEarn && rateRes.rate != null && (
              <div className="text-center">
                <div className="tabular text-2xl font-semibold text-signal">{money(rateRes.amount, profile.currency)}</div>
                <div className="text-xs text-muted">{rateRes.source === "company" ? t("companyRate") : t("personalEstimate")} · {t("beforeTax")}</div>
              </div>
            )}
          </div>

          {/* actions */}
          <div className="flex flex-col items-center gap-3">
            {!active ? (
              <button onClick={start} disabled={busy} className="h-28 w-28 rounded-full bg-text px-2 text-center text-base font-semibold leading-tight text-bg disabled:opacity-60">
                {busy ? "…" : t("startShift")}
              </button>
            ) : (
              <>
                <button onClick={finish} disabled={busy} className="h-28 w-28 rounded-full bg-signal px-2 text-center text-base font-semibold leading-tight text-[#0B1320] disabled:opacity-60">
                  {busy ? "…" : t("finishShift")}
                </button>
                <button onClick={toggleBreak} className="rounded-full border border-border px-6 py-2 text-sm">
                  {phase === "onBreak" ? t("resume") : t("pause")}
                </button>
              </>
            )}
            {gps === "denied" && <p className="text-sm text-alert">{t("gpsDenied")}</p>}
          </div>

          {/* pay week total */}
          <div className="rounded-2xl border border-border bg-surface p-4 text-center">
            <div className="text-sm text-muted">{t("weekTotal")}</div>
            <div className="tabular text-2xl font-semibold">{hours1(weekSeconds)} {t("hoursUnit")}</div>
            {showEarn && weekEarn.rate != null && (
              <div className="tabular text-lg font-semibold text-signal">{money(weekEarn.amount, profile.currency)}</div>
            )}
            <div className="mt-1 text-xs text-muted">
              {t("paidWeekly")} · {t("monthTotal").toLowerCase()} {hours1(monthSeconds)} {t("hoursUnit")}
              {showEarn && monthEarn.rate != null ? ` · ${money(monthEarn.amount, profile.currency)}` : ""}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-4 text-center">
            <div className="text-sm text-muted">{t("weekTotal")}</div>
            <div className="tabular text-3xl font-semibold">{hours1(weekSeconds)} {t("hoursUnit")}</div>
            {showEarn && weekEarn.rate != null && (
              <div className="tabular text-lg font-semibold text-signal">{money(weekEarn.amount, profile.currency)}</div>
            )}
            <div className="mt-1 text-xs text-muted">{t("paidWeekly")}</div>
          </div>

          {byWeek.length === 0 ? (
            <p className="py-8 text-center text-muted">{t("noShifts")}</p>
          ) : (
            byWeek.map((wk) => {
              const earn = resolveEarnings(wk.seconds, profile.hourly_rate, profile.self_hourly_rate);
              const current = wk.key === thisWeekKey;
              return (
                <div key={wk.key} className="space-y-2">
                  <div className="flex items-baseline justify-between border-b border-border pb-1">
                    <div className="text-sm font-semibold">
                      {current ? t("thisWeek") : wk.label}
                      {current && <span className="ml-2 text-xs font-normal text-muted">{wk.label}</span>}
                    </div>
                    <div className="text-right">
                      <span className="tabular font-semibold">{hours1(wk.seconds)} {t("hoursUnit")}</span>
                      {showEarn && earn.rate != null && (
                        <span className="tabular ml-2 font-semibold text-signal">{money(earn.amount, profile.currency)}</span>
                      )}
                    </div>
                  </div>
                  {wk.rows.map((s) => {
                    const worked = s.worked_seconds ?? (s.ended_at ? Math.max(0, Math.floor((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000) - s.break_seconds) : 0);
                    return (
                      <div key={s.id} className="rounded-xl border border-border bg-surface p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{fmtDate(s.started_at)}</div>
                          <div className="tabular font-semibold">{hours1(worked)} {t("hoursUnit")}</div>
                        </div>
                        <div className="tabular mt-0.5 text-sm text-muted">
                          {fmtTime(s.started_at)} – {s.ended_at ? fmtTime(s.ended_at) : "…"}
                          {s.break_seconds > 0 && <span> · {t("breakShort")} {Math.round(s.break_seconds / 60)}m</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">{children}</div>;
}

function SignOut() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); router.refresh(); }} className="rounded-lg border border-border px-4 py-2 text-sm text-muted">
      {t("signOut")}
    </button>
  );
}

function Consent({ userId, onDone }: { userId: string; onDone: () => void }) {
  const supabase = supabaseBrowser();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function agree() {
    setBusy(true);
    const { error } = await supabase.from("consents").insert({
      user_id: userId,
      kind: "geolocation_notice",
      version: "2",
      granted: true,
    });
    if (error) {
      setBusy(false);
      alert(error.message);
      return;
    }
    onDone();
  }
  return (
    <Centered>
      <LangSwitcher />
      <h1 className="font-display text-2xl font-bold">{t("consentTitle")}</h1>
      <p className="text-muted">{t("consentBody")}</p>
      <button onClick={agree} disabled={busy} className="rounded-lg bg-live px-6 py-3 font-semibold text-white disabled:opacity-60">{t("agree")}</button>
    </Centered>
  );
}
