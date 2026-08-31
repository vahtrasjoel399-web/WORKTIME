import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { IS_DEMO } from "@/lib/config";
import { setLocale, type Locale } from "@/i18n";

// Synthetic profile used only in demo mode (no backend). Persisted locally so
// settings changes stick between launches.
const DEMO_PROFILE: Profile = {
  id: "demo-user",
  company_id: "demo-company",
  first_name: "Demo",
  last_name: "",
  role: "worker",
  is_active: true,
  is_approved: true,
  locale: "et",
  hourly_rate: null,
  self_hourly_rate: 15,
  currency: "EUR",
  target_shift_hours: 8,
  show_earnings: true,
  theme: "system",
};

export interface Profile {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  role: "worker" | "admin";
  is_active: boolean;
  is_approved: boolean;
  locale: Locale;
  hourly_rate: number | null;
  self_hourly_rate: number | null;
  currency: string;
  target_shift_hours: number;
  show_earnings: boolean;
  theme: "light" | "dark" | "system";
}

interface Ctx {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  hasConsent: boolean | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);

  const loadFor = useCallback(async (uid: string | null) => {
    setUserId(uid);
    if (!uid) {
      setProfile(null);
      setHasConsent(null);
      return;
    }
    const [{ data: prof }, { count }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).single(),
      supabase
        .from("consents")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("kind", "geolocation_notice")
        .eq("version", "2")
        .eq("granted", true),
    ]);
    if (prof) {
      setProfile(prof as Profile);
      if (prof.locale) await setLocale(prof.locale as Locale);
    }
    setHasConsent((count ?? 0) > 0);
  }, []);

  useEffect(() => {
    if (IS_DEMO) {
      // no login, no consent gate — load the local demo profile and go
      AsyncStorage.getItem("demo-profile").then((saved) => {
        const p = saved ? { ...DEMO_PROFILE, ...JSON.parse(saved) } : DEMO_PROFILE;
        setUserId(p.id);
        setProfile(p);
        setHasConsent(true);
        if (p.locale) void setLocale(p.locale as Locale);
        setLoading(false);
      });
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      await loadFor(data.session?.user.id ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadFor(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadFor]);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadFor(userId);
  }, [userId, loadFor]);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!userId) return;
      setProfile((p) => {
        const next = p ? { ...p, ...patch } : p;
        if (IS_DEMO && next) void AsyncStorage.setItem("demo-profile", JSON.stringify(next));
        return next;
      }); // optimistic
      if (!IS_DEMO) await supabase.from("profiles").update(patch).eq("id", userId);
      if (patch.locale) await setLocale(patch.locale);
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    if (IS_DEMO) return; // nothing to sign out of in demo mode
    await supabase.auth.signOut();
  }, []);

  return (
    <SessionContext.Provider
      value={{ loading, userId, profile, hasConsent, refreshProfile, updateProfile, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Ctx {
  const c = useContext(SessionContext);
  if (!c) throw new Error("useSession must be used within SessionProvider");
  return c;
}
