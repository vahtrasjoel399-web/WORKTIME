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

async function listEmployeeFiles(companyId: string, employeeId: string): Promise<string[]> {
  const paths: string[] = [];
  for (const area of ["photos", "documents"]) {
    const prefix = `company/${companyId}/employees/${employeeId}/${area}`;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.storage
        .from("employee-files")
        .list(prefix, { limit: 100, offset });
      if (error) throw error;
      for (const object of data ?? []) paths.push(`${prefix}/${object.name}`);
      if ((data?.length ?? 0) < 100) break;
    }
  }
  return paths;
}

Deno.serve(async (req) => {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const userId = url.searchParams.get("user_id")!;
    if (!(await callerIsAdminOf(token, userId))) return new Response("Forbidden", { status: 403 });
    const [{ data, error }, { data: documents, error: documentsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
      admin.rpc("export_worker", { target: userId }),
      admin.from("employee_documents").select("id, filename, storage_path, document_type, mime_type, size_bytes, created_at").eq("employee_id", userId).order("created_at", { ascending: false }),
      admin.from("employee_assignments").select("id, site_id, start_date, end_date, created_at").eq("employee_id", userId).order("start_date", { ascending: false }),
    ]);
    if (error) return new Response(error.message, { status: 500 });
    if (documentsError || assignmentsError) return new Response("Could not prepare complete export", { status: 500 });
    const paths = (documents ?? []).map((document) => document.storage_path);
    const signedByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed, error: signedError } = await admin.storage.from("employee-files").createSignedUrls(paths, 900);
      if (signedError) return new Response(signedError.message, { status: 500 });
      for (const item of signed ?? []) if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    }
    const exportData = {
      ...(data ?? {}),
      employee_documents: (documents ?? []).map((document) => ({
        ...document,
        download_url: signedByPath.get(document.storage_path) ?? null,
        download_url_expires_in_seconds: 900,
      })),
      employee_assignments: assignments ?? [],
    };
    const { data: actor } = await admin.auth.getUser(token);
    const { data: profile } = await admin.from("profiles").select("company_id").eq("id", actor.user!.id).single();
    const { error: auditError } = await admin.from("audit_logs").insert({ company_id: profile!.company_id, actor_id: actor.user!.id, action: "worker.data_exported", target_type: "profile", target_id: userId });
    if (auditError) return new Response("Could not record export audit event", { status: 500 });
    return Response.json(exportData, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (req.method === "POST") {
    const { user_id, confirmation } = await req.json();
    if (confirmation !== "DELETE") return new Response("Explicit deletion confirmation required", { status: 400 });
    if (!(await callerIsAdminOf(token, user_id))) return new Response("Forbidden", { status: 403 });
    const { data: actor } = await admin.auth.getUser(token);
    const { data: profile } = await admin.from("profiles").select("company_id").eq("id", actor.user!.id).single();
    const { error: auditError } = await admin.from("audit_logs").insert({ company_id: profile!.company_id, actor_id: actor.user!.id, action: "worker.deletion_requested", target_type: "profile", target_id: user_id });
    if (auditError) return new Response("Could not record deletion audit event", { status: 500 });
    try {
      const storagePaths = await listEmployeeFiles(profile!.company_id, user_id);
      for (let index = 0; index < storagePaths.length; index += 100) {
        const { error: storageError } = await admin.storage
          .from("employee-files")
          .remove(storagePaths.slice(index, index + 100));
        if (storageError) return new Response(storageError.message, { status: 500 });
      }
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Could not delete private files", { status: 500 });
    }
    // deletes auth user; ON DELETE CASCADE removes profile → shifts → breaks → consents
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return new Response(error.message, { status: 500 });
    await admin.from("audit_logs").insert({ company_id: profile!.company_id, actor_id: actor.user!.id, action: "worker.deleted", target_type: "profile", target_id: user_id });
    return Response.json({ deleted: user_id });
  }

  return new Response("Method not allowed", { status: 405 });
});
