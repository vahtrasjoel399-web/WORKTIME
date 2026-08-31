// Supabase Edge Function — GDPR access & erasure for a single worker.
//   GET  ?user_id=...  → full JSON export (right of access)
//   POST { user_id, confirmation: "DELETE" } → hard-delete worker data
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
  return me.user.id !== targetUserId && !!caller && caller.role === "admin" && !!target && target.role === "worker" &&
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
    const { data: actor } = await admin.auth.getUser(token);
    const { data: profile } = await admin.from("profiles").select("company_id").eq("id", actor.user!.id).single();
    await admin.from("audit_logs").insert({ company_id: profile!.company_id, actor_id: actor.user!.id, action: "worker.data_exported", target_type: "profile", target_id: userId });
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (req.method === "POST") {
    const { user_id, confirmation } = await req.json();
    if (confirmation !== "DELETE") return new Response("Explicit deletion confirmation required", { status: 400 });
    if (!(await callerIsAdminOf(token, user_id))) return new Response("Forbidden", { status: 403 });
    const { data: actor } = await admin.auth.getUser(token);
    const { data: profile } = await admin.from("profiles").select("company_id").eq("id", actor.user!.id).single();
    await admin.from("audit_logs").insert({ company_id: profile!.company_id, actor_id: actor.user!.id, action: "worker.deletion_requested", target_type: "profile", target_id: user_id });
    // deletes auth user; ON DELETE CASCADE removes profile → shifts → breaks → consents
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return new Response(error.message, { status: 500 });
    await admin.from("audit_logs").insert({ company_id: profile!.company_id, actor_id: actor.user!.id, action: "worker.deleted", target_type: "profile", target_id: user_id });
    return Response.json({ deleted: user_id });
  }

  return new Response("Method not allowed", { status: 405 });
});
