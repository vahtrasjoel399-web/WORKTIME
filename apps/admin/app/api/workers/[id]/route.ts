import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";
import { emailSuggestion, isValidEmail, normalizeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse("Invalid worker id", { status: 400 });

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();
  if (!me || me.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const { data: target } = await supabase
    .from("profiles")
    .select("company_id, role, email")
    .eq("id", id)
    .single();
  if (!target || target.role !== "worker" || target.company_id !== me.company_id) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const firstName = typeof body?.first_name === "string" ? body.first_name.trim() : "";
  const lastName = typeof body?.last_name === "string" ? body.last_name.trim() : "";
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  const position = typeof body?.position === "string" && body.position.trim() ? body.position.trim() : null;
  const isActive = body?.is_active;

  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) {
    return new NextResponse("Invalid worker name", { status: 400 });
  }
  const suggestedEmail = emailSuggestion(email);
  if (suggestedEmail) {
    return new NextResponse(`Check the email address. Did you mean ${suggestedEmail}?`, { status: 400 });
  }
  if (!isValidEmail(email)) return new NextResponse("Invalid email address", { status: 400 });
  if (phone && phone.length > 40) return new NextResponse("Phone number is too long", { status: 400 });
  if (position && position.length > 120) return new NextResponse("Position is too long", { status: 400 });
  if (typeof isActive !== "boolean") return new NextResponse("Invalid status", { status: 400 });

  const service = supabaseService();
  const { data: authTarget, error: authReadError } = await service.auth.admin.getUserById(id);
  if (authReadError || !authTarget.user) return new NextResponse("Worker auth account not found", { status: 404 });

  const oldAuthEmail = authTarget.user.email ?? null;
  const emailChanged = email !== normalizeEmail(oldAuthEmail ?? target.email ?? "");
  if (emailChanged) {
    const { error: authUpdateError } = await service.auth.admin.updateUserById(id, { email });
    if (authUpdateError) return new NextResponse(authUpdateError.message, { status: 400 });
  }

  // Use the caller-scoped client so both RLS and the profile protection trigger
  // verify that this update is being made by a same-company admin.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      position,
      is_active: isActive,
    })
    .eq("id", id);

  if (profileError) {
    if (emailChanged && oldAuthEmail) {
      await service.auth.admin.updateUserById(id, { email: oldAuthEmail });
    }
    return new NextResponse(profileError.message, { status: 400 });
  }

  return NextResponse.json({ updated: id });
}
