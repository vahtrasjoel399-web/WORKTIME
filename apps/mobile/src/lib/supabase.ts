import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_URL, SUPABASE_ANON_KEY, IS_DEMO } from "./config";

if (IS_DEMO) {
  console.log("Tööaeg running in DEMO mode — local-only, no backend.");
}

// In demo mode we still create a client (with harmless placeholder values) so the
// rest of the code can import `supabase` freely; its calls just fail quietly and
// the app falls back to local SQLite.
const url = SUPABASE_URL || "https://demo.invalid";
const anon = SUPABASE_ANON_KEY || "demo";

export const supabase = createClient(url, anon, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
