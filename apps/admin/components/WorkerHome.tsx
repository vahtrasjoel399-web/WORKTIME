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
import { calculatePricingTotal, pricingUnit, PRICING_LABELS, shiftTotal } from "@/lib/pricing";
import { Icon } from "./Icon";

interface Shift {
  id: string;
  started_at: string;
  ended_at: string | null;
  break_seconds: number;
  status: "open" | "closed";
  worked_seconds?: number | null;
  pricing_type: "hourly" | "area" | "quantity";
  pricing_rate: number | null;
  quantity: number | null;
  unit: string | null;
  calculated_total: number | null;
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
  const [collectingQuantity, setCollectingQuantity] = useState(false);
  const [completedQuantity, setCompletedQuantity] = useState("");
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
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-signal/10 text-signal"><Icon name="clock" className="h-6 w-6" /></span>
        <h1 className="font-display text-2xl font-bold">{t("pendingTitle")}</h1>
        <p className="text-muted">{t("pendingBody")}</p>
        <div className="flex gap-2">
          <button onClick={() => router.refresh()} className="btn-primary">{t("checkAgain")}</button>
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
  const pricingType = profile.pricing_type ?? "hourly";
  const configuredRate = pricingType === "hourly" ? rateRes.rate : profile.hourly_rate;
  const activePricingType = shift?.pricing_type ?? pricingType;
  const activeRate = shift?.pricing_rate ?? configuredRate;
  const activeUnit = shift?.unit ?? profile.pricing_unit;
  const now = new Date();
  const thisWeekKey = weekKey(now);
  const running = phase !== "idle" ? seconds : 0;

  const weekRows = shifts.filter((s) => weekKey(new Date(s.started_at)) === thisWeekKey);
  const weekSeconds = weekRows.reduce((a, s) => a + (s.worked_seconds ?? 0), 0) + running;
  const closedWeekEarned = weekRows.reduce((sum, row) => sum + shiftTotal(row, rateRes.rate), 0);
  const runningEarned = pricingType === "hourly" ? resolveEarnings(running, profile.hourly_rate, profile.self_hourly_rate).amount : 0;
  const weekEarned = closedWeekEarned + runningEarned;

  // history grouped into pay weeks, newest first
  const byWeek: { key: string; label: string; seconds: number; amount: number; rows: Shift[] }[] = [];
  for (const s of shifts) {
    const d = new Date(s.started_at);
    const key = weekKey(d);
    let bucket = byWeek.find((b) => b.key === key);
    if (!bucket) {
      bucket = { key, label: `${t("weekShort")}${isoWeek(d)} · ${weekDates(d)}`, seconds: 0, amount: 0, rows: [] };
      byWeek.push(bucket);
    }
    bucket.seconds += s.worked_seconds ?? 0;
    bucket.amount += shiftTotal(s, rateRes.rate);
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
          start_lat: f.lat, start_lng: f.lng, start_accuracy_m: f.acc, start_address: f.address, break_seconds: 0, status: "open", source: "app",
          pricing_type: pricingType, pricing_rate: configuredRate, unit: profile.pricing_unit })
        .select("*").single();
      if (error) throw error;
      breakAccum.current = 0; breakStart.current = null;
      setShift(data as Shift); setPhase("running"); setSeconds(0); setGps("ok");
    } catch (e: any) {
      setGps(e?.code === 1 ? "denied" : "idle");
    } finally { setBusy(false); }
  }

  async function finish(completed: number | null = null) {
    if (!shift) return;
    setBusy(true); setGps("getting");
    try {
      const f = await getFix();
      if (breakStart.current) { breakAccum.current += Math.floor((Date.now() - breakStart.current) / 1000); breakStart.current = null; }
      const { error } = await supabase.from("shifts").update({ ended_at: new Date().toISOString(), end_lat: f.lat, end_lng: f.lng,
        end_accuracy_m: f.acc, end_address: f.address, break_seconds: breakAccum.current, status: "closed",
        quantity: activePricingType === "hourly" ? null : completed }).eq("id", shift.id);
      if (error) throw error;
      setShift(null); setPhase("idle"); setSeconds(0); setGps("idle");
      setCollectingQuantity(false); setCompletedQuantity("");
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
    if (v != null && (!Number.isFinite(v) || v < 0)) return;
    await supabase.from("profiles").update({ self_hourly_rate: v, show_earnings: showEarn }).eq("id", profile.id);
    setShowSettings(false);
    router.refresh();
  }

  const active = phase !== "idle";
  const target = (profile.target_shift_hours || 8) * 3600;
  const pct = Math.min(100, (seconds / target) * 100);
  const parsedCompleted = completedQuantity.trim() ? Number(completedQuantity.replace(",", ".")) : Number.NaN;
  const completionTotal = calculatePricingTotal({ pricingType: activePricingType, rate: activeRate, quantity: parsedCompleted });

  return (
    <div className="worker-home mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-md flex-col justify-between gap-5 py-2 sm:min-h-[85vh] sm:gap-6 sm:py-6">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-xl font-bold">{profile.first_name}</div>
          <div className="text-sm text-muted">{active ? (phase === "onBreak" ? t("onBreak") : t("shiftRunning")) : t("notStarted")}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {gps === "ok" && <span className="text-xs text-live">● GPS</span>}
          {gps === "getting" && <span className="text-xs text-muted">GPS…</span>}
          <button onClick={() => setShowSettings((s) => !s)} aria-label={t("settings")} aria-expanded={showSettings} className="btn-secondary h-10 w-10 px-0"><Icon name="settings" className="h-4 w-4" /></button>
        </div>
      </div>

      {showSettings && (
        <div className="panel-pad space-y-3 text-sm">
          <LangSwitcher />
          {profile.hourly_rate != null ? (
            <div><span className="text-muted">Hinna tüüp: {PRICING_LABELS[pricingType]} · </span><b className="tabular">{money(profile.hourly_rate, profile.currency)}/{pricingUnit(pricingType, profile.pricing_unit)}</b></div>
          ) : (
            pricingType === "hourly" ? <label className="block"><span className="text-muted">{t("yourRate")}</span>
              <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" className="control mt-1 bg-bg" /></label>
            : <p className="text-muted">Tööandja pole hinda määranud.</p>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" checked={showEarn} onChange={(e) => setShowEarn(e.target.checked)} /> {t("showEarnings")}</label>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <button onClick={saveSettings} className="btn-primary flex-1">{t("save")}</button>
            <button onClick={toggleTheme} className="btn-secondary"><Icon name="moon" className="h-4 w-4" />{t("theme")}</button>
          </div>
          <SignOut />
        </div>
      )}

      {/* tabs */}
      <div className="flex gap-1 rounded-lg bg-surface p-1" role="tablist">
        <button role="tab" aria-selected={view === "shift"} onClick={() => setView("shift")} className={`flex-1 rounded-md py-2 text-sm ${view === "shift" ? "bg-primary/10 font-medium text-primary" : "text-muted"}`}>{t("tabShift")}</button>
        <button role="tab" aria-selected={view === "hours"} onClick={() => setView("hours")} className={`flex-1 rounded-md py-2 text-sm ${view === "hours" ? "bg-primary/10 font-medium text-primary" : "text-muted"}`}>{t("tabHours")}</button>
      </div>

      {view === "shift" ? (
        <>
          {/* timer */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex size-[min(16rem,72vw)] max-h-[32dvh] max-w-[32dvh] items-center justify-center sm:size-64 sm:max-h-none sm:max-w-none">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="6" />
                <circle cx="50" cy="50" r="45" fill="none" stroke={active ? "var(--signal)" : "var(--text-muted)"} strokeWidth="6"
                  strokeLinecap="round" strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - pct / 100)}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }} />
              </svg>
              <div className={`tabular text-3xl font-semibold min-[380px]:text-4xl ${active ? "text-signal" : "text-text"}`}>{hms(seconds)}</div>
            </div>

            {active && pricingType === "hourly" && showEarn && rateRes.rate != null && (
              <div className="text-center">
                <div className="tabular text-2xl font-semibold text-signal">{money(rateRes.amount, profile.currency)}</div>
                <div className="text-xs text-muted">{rateRes.source === "company" ? t("companyRate") : t("personalEstimate")} · {t("beforeTax")}</div>
              </div>
            )}
          </div>

          {/* actions */}
          <div className="flex flex-col items-center gap-3">
            {!active ? (
              <button onClick={start} disabled={busy} className="h-28 w-28 rounded-full bg-primary px-2 text-center text-base font-semibold leading-tight text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
                {busy ? "…" : t("startShift")}
              </button>
            ) : (
              <>
                <button onClick={() => activePricingType === "hourly" ? void finish() : setCollectingQuantity(true)} disabled={busy} className="h-28 w-28 rounded-full bg-signal px-2 text-center text-base font-semibold leading-tight text-[#0B1320] disabled:opacity-60">
                  {busy ? "…" : t("finishShift")}
                </button>
                <button onClick={toggleBreak} className="rounded-full border border-border px-6 py-2 text-sm">
                  {phase === "onBreak" ? t("resume") : t("pause")}
                </button>
              </>
            )}
            {gps === "denied" && <p className="text-sm text-alert">{t("gpsDenied")}</p>}
          </div>

          {collectingQuantity && activePricingType !== "hourly" && (
            <div className="panel-pad space-y-3 border-signal">
              <label className="block text-sm">
                <span className="text-muted">{activePricingType === "area" ? "Tehtud kogus (m²)" : `Kogus (${activeUnit ?? "ühik"})`}</span>
                <input autoFocus inputMode="decimal" value={completedQuantity} onChange={(event) => setCompletedQuantity(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-lg tabular" />
              </label>
              <div className="text-right"><span className="text-sm text-muted">Kokku: </span><b className="tabular text-lg text-signal">{completionTotal == null ? "—" : money(completionTotal, profile.currency)}</b></div>
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                <button disabled={busy || !Number.isFinite(parsedCompleted) || parsedCompleted < 0 || completionTotal == null} onClick={() => void finish(parsedCompleted)} className="btn-primary flex-1">Salvesta ja lõpeta</button>
                <button onClick={() => setCollectingQuantity(false)} className="btn-secondary">Tühista</button>
              </div>
            </div>
          )}

        </>
      ) : (
        <div className="flex-1 space-y-4">
          <div className="panel p-4 text-center">
            <div className="text-sm text-muted">{t("weekTotal")}</div>
            <div className="tabular text-3xl font-semibold">{hours1(weekSeconds)} {t("hoursUnit")}</div>
            {showEarn && weekEarned > 0 && (
              <div className="tabular text-lg font-semibold text-signal">{money(weekEarned, profile.currency)}</div>
            )}
            <div className="mt-1 text-xs text-muted">{t("paidWeekly")}</div>
          </div>

          {byWeek.length === 0 ? (
            <p className="py-8 text-center text-muted">{t("noShifts")}</p>
          ) : (
            byWeek.map((wk) => {
              const current = wk.key === thisWeekKey;
              return (
                <div key={wk.key} className="space-y-2">
                  <div className="flex items-start justify-between gap-3 border-b border-border pb-1">
                    <div className="min-w-0 text-sm font-semibold">
                      {current ? t("thisWeek") : wk.label}
                      {current && <span className="mt-0.5 block text-xs font-normal text-muted min-[380px]:ml-2 min-[380px]:mt-0 min-[380px]:inline">{wk.label}</span>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="tabular block font-semibold min-[380px]:inline">{hours1(wk.seconds)} {t("hoursUnit")}</span>
                      {showEarn && wk.amount > 0 && (
                        <span className="tabular block text-sm font-semibold text-signal min-[380px]:ml-2 min-[380px]:inline">{money(wk.amount, profile.currency)}</span>
                      )}
                    </div>
                  </div>
                  {wk.rows.map((s) => {
                    const worked = s.worked_seconds ?? (s.ended_at ? Math.max(0, Math.floor((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000) - s.break_seconds) : 0);
                    return (
                      <div key={s.id} className="rounded-xl border border-border bg-surface p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">{fmtDate(s.started_at)}</div>
                            <div className="mt-0.5 break-words text-xs text-muted">{PRICING_LABELS[s.pricing_type ?? "hourly"]}{(s.pricing_type ?? "hourly") !== "hourly" && s.quantity != null ? ` · ${s.quantity} ${s.unit}` : ""}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="tabular font-semibold">{hours1(worked)} {t("hoursUnit")}</div>
                            {showEarn && shiftTotal(s, rateRes.rate) > 0 && <div className="tabular text-sm font-semibold text-signal">{money(shiftTotal(s, rateRes.rate), profile.currency)}</div>}
                          </div>
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
