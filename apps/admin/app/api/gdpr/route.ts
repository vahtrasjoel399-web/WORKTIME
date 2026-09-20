import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type AdminTargetAuthorization =
  | { ok: false }
  | { ok: true; companyId: string; actorId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function listEmployeeFiles(
  service: ReturnType<typeof supabaseService>,
  companyId: string,
  employeeId: string,
): Promise<{ paths: string[]; error: string | null }> {
  const paths: string[] = [];
  for (const area of ["photos", "documents"] as const) {
    const prefix = `company/${companyId}/employees/${employeeId}/${area}`;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await service.storage
        .from("employee-files")
        .list(prefix, { limit: 100, offset });
      if (error) return { paths: [], error: error.message };
      for (const object of data ?? []) paths.push(`${prefix}/${object.name}`);
      if ((data?.length ?? 0) < 100) break;
    }
  }
  return { paths, error: null };
}

// GDPR access + erasure. We re-verify here (defence in depth) that the caller is
// an admin of the target worker's company before using the service role. (spec §5)
async function assertAdminOf(userId: string): Promise<AdminTargetAuthorization> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!me || me.role !== "admin" || user.id === userId) return { ok: false };
  const { data: target } = await supabase.from("profiles").select("company_id").eq("id", userId).single();
  if (!target || target.company_id !== me.company_id) return { ok: false };
  return { ok: true, companyId: me.company_id, actorId: user.id };
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  if (!UUID_RE.test(userId)) return new NextResponse("Valid user_id required", { status: 400 });
  const auth = await assertAdminOf(userId);
  if (!auth.ok) return new NextResponse("Forbidden", { status: 403 });
  const service = supabaseService();
  const [{ data, error }, { data: documents, error: documentsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    service.rpc("export_worker", { target: userId }),
    service
      .from("employee_documents")
      .select("id, filename, storage_path, document_type, mime_type, size_bytes, created_at")
      .eq("employee_id", userId)
      .order("created_at", { ascending: false }),
    service
      .from("employee_assignments")
      .select("id, site_id, start_date, end_date, created_at")
      .eq("employee_id", userId)
      .order("start_date", { ascending: false }),
  ]);
  if (error) return new NextResponse(error.message, { status: 500 });
  if (documentsError || assignmentsError) return new NextResponse("Could not prepare complete export", { status: 500 });

  const paths = (documents ?? []).map((document) => document.storage_path);
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signedError } = await service.storage
      .from("employee-files")
      .createSignedUrls(paths, 900);
    if (signedError) return new NextResponse("Could not prepare document downloads", { status: 500 });
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    }
  }

  const exportData = {
    ...((data ?? {}) as Record<string, unknown>),
    employee_documents: (documents ?? []).map((document) => ({
      ...document,
      download_url: signedByPath.get(document.storage_path) ?? null,
      download_url_expires_in_seconds: 900,
    })),
    employee_assignments: assignments ?? [],
  };
  const { error: auditError } = await service.from("audit_logs").insert({
    company_id: auth.companyId,
    actor_id: auth.actorId,
    action: "worker.data_exported",
    target_type: "profile",
    target_id: userId,
  });
  if (auditError) return new NextResponse("Could not record export audit event", { status: 500 });
  return NextResponse.json(exportData, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { user_id, confirmation } = body ?? {};
  if (typeof user_id !== "string" || !UUID_RE.test(user_id) || confirmation !== "DELETE") {
    return new NextResponse("Explicit deletion confirmation required", { status: 400 });
  }
  const auth = await assertAdminOf(user_id);
  if (!auth.ok) return new NextResponse("Forbidden", { status: 403 });
  const service = supabaseService();
  const { data: target, error: targetError } = await service
    .from("profiles")
    .select("profile_photo_path")
    .eq("id", user_id)
    .single();
  if (targetError) return new NextResponse("Could not prepare worker deletion", { status: 500 });

  const { error: auditError } = await service.from("audit_logs").insert({
    company_id: auth.companyId,
    actor_id: auth.actorId,
    action: "worker.deletion_requested",
    target_type: "profile",
    target_id: user_id,
  });
  if (auditError) return new NextResponse("Could not record deletion audit event", { status: 500 });

  const listed = await listEmployeeFiles(service, auth.companyId, user_id);
  if (listed.error) return new NextResponse("Could not list private employee files", { status: 500 });
  const storagePaths = [...new Set([
    ...listed.paths,
    ...(target.profile_photo_path ? [target.profile_photo_path] : []),
  ])];
  for (let index = 0; index < storagePaths.length; index += 100) {
    const { error: storageError } = await service.storage
      .from("employee-files")
      .remove(storagePaths.slice(index, index + 100));
    if (storageError) return new NextResponse("Could not delete private employee files", { status: 500 });
  }

  // deleting the auth user cascades to profile → shifts → breaks → consents
  const { error } = await service.auth.admin.deleteUser(user_id);
  if (error) return new NextResponse(error.message, { status: 500 });
  await service.from("audit_logs").insert({
    company_id: auth.companyId,
    actor_id: auth.actorId,
    action: "worker.deleted",
    target_type: "profile",
    target_id: user_id,
  });
  return NextResponse.json({ deleted: user_id });
}
