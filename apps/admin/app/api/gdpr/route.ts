import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GDPR access + erasure. We re-verify here (defence in depth) that the caller is
// an admin of the target worker's company before using the service role. (spec §5)
async function assertAdminOf(userId: string): Promise<{ ok: boolean; companyId?: string }> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!me || me.role !== "admin") return { ok: false };
  const { data: target } = await supabase.from("profiles").select("company_id").eq("id", userId).single();
  if (!target || target.company_id !== me.company_id) return { ok: false };
  return { ok: true, companyId: me.company_id };
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id")!;
  const { ok } = await assertAdminOf(userId);
  if (!ok) return new NextResponse("Forbidden", { status: 403 });
  const { data, error } = await supabaseService().rpc("export_worker", { target: userId });
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { user_id } = await req.json();
  const { ok } = await assertAdminOf(user_id);
  if (!ok) return new NextResponse("Forbidden", { status: 403 });
  // deleting the auth user cascades to profile → shifts → breaks → consents
  const { error } = await supabaseService().auth.admin.deleteUser(user_id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ deleted: user_id });
}
