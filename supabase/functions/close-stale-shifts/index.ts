// Supabase Edge Function — flag shifts left open > 16h and notify admins.
// Scheduled by pg_cron (see README). Auth: shared CRON_SECRET bearer token.
//
//   supabase functions deploy close-stale-shifts
//
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${Deno.env.get("CRON_SECRET")}`;
  if (auth !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // mark_stale_shifts() flips is_stale on shifts open > 16h and returns them.
  const { data: flagged, error } = await supabase.rpc("mark_stale_shifts");
  if (error) return new Response(error.message, { status: 500 });

  // Notify the admin(s) of each affected company. Here we just log; wire this to
  // email/push as needed. Kept side-effect-light so the sweep is idempotent.
  for (const s of flagged ?? []) {
    console.log(`stale shift ${s.id} (company ${s.company_id}, user ${s.user_id})`);
  }

  return Response.json({ flagged: flagged?.length ?? 0 });
});
