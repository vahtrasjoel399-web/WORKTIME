import { supabaseServer } from "./supabase-server";
import type { Profile } from "./types";

// Current signed-in user's profile (or null). Used by pages to route by role.
export async function getProfile(): Promise<Profile | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}
