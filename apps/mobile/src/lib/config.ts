import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Demo mode: when there is no real Supabase configured (or EXPO_PUBLIC_DEMO=1),
// the app runs entirely on the phone's local SQLite with a synthetic profile —
// no backend, no login. Lets anyone scan the QR and try shifts/GPS immediately.
export const IS_DEMO =
  process.env.EXPO_PUBLIC_DEMO === "1" ||
  !SUPABASE_URL ||
  SUPABASE_URL.includes("YOUR-REF");
