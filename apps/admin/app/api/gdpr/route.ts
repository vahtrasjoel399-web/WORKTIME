import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type AdminTargetAuthorization =
  | { ok: false }
  | { ok: true; companyId: string; actorId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const { data, error } = await supabaseService().rpc("export_worker", { target: userId });
  if (error) return new NextResponse(error.message, { status: 500 });
  const { error: auditError } = await supabaseService().from("audit_logs").insert({
    company_id: auth.companyId,
    actor_id: auth.actorId,
    action: "worker.data_exported",
    target_type: "profile",
    target_id: userId,
  });
  if (auditError) return new NextResponse("Could not record export audit event", { status: 500 });
  return NextResponse.json(data, {
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
  const { error: auditError } = await supabaseService().from("audit_logs").insert({
    company_id: auth.companyId,
    actor_id: auth.actorId,
    action: "worker.deletion_requested",
    target_type: "profile",
    target_id: user_id,
  });
  if (auditError) return new NextResponse("Could not record deletion audit event", { status: 500 });
  // deleting the auth user cascades to profile → shifts → breaks → consents
  const { error } = await supabaseService().auth.admin.deleteUser(user_id);
  if (error) return new NextResponse(error.message, { status: 500 });
  await supabaseService().from("audit_logs").insert({
    company_id: auth.companyId,
    actor_id: auth.actorId,
    action: "worker.deleted",
    target_type: "profile",
    target_id: user_id,
  });
  return NextResponse.json({ deleted: user_id });
}
