// Supabase Edge Function — GDPR access & erasure for a single worker.
//   GET  ?user_id=...  → full JSON export (right of access)
//   POST { user_id }   → hard-delete the worker's account + data (right to erasure)
//
// Called from the admin panel server side with the service role. The function
// itself verifies the *caller* is an admin of the same company before acting.
//
//   supabase functions deploy gdpr-worker
//
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function callerIsAdminOf(token: string, targetUserId: string): Promise<boolean> {
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: me } = await userClient.auth.getUser();
  if (!me?.user) return false;
  const { data: rows } = await admin
    .from("profiles")
    .select("id, role, company_id")
    .in("id", [me.user.id, targetUserId]);
  const caller = rows?.find((r) => r.id === me.user!.id);
  const target = rows?.find((r) => r.id === targetUserId);
  return !!caller && caller.role === "admin" && !!target &&
    caller.company_id === target.company_id;
}

Deno.serve(async (req) => {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const userId = url.searchParams.get("user_id")!;
    if (!(await callerIsAdminOf(token, userId))) return new Response("Forbidden", { status: 403 });
    const { data, error } = await admin.rpc("export_worker", { target: userId });
    if (error) return new Response(error.message, { status: 500 });
    return Response.json(data);
  }

  if (req.method === "POST") {
    const { user_id } = await req.json();
    if (!(await callerIsAdminOf(token, user_id))) return new Response("Forbidden", { status: 403 });
    // deletes auth user; ON DELETE CASCADE removes profile → shifts → breaks → consents
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return new Response(error.message, { status: 500 });
    return Response.json({ deleted: user_id });
  }

  return new Response("Method not allowed", { status: 405 });
});
