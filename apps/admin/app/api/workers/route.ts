import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";
import { emailSuggestion, isValidEmail, normalizeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Creates a worker account (no self sign-up exists). The admin's company is read
// from their own session; the new auth user + profile are created with the service
// role, then the worker signs in with the emailed temporary password.
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!me || me.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const { first_name, last_name, email, phone, hourly_rate, locale } = body ?? {};
  const cleanEmail = typeof email === "string" ? normalizeEmail(email) : "";
  const cleanFirst = typeof first_name === "string" ? first_name.trim() : "";
  const cleanLast = typeof last_name === "string" ? last_name.trim() : "";
  if (!cleanFirst || cleanFirst.length > 80 || cleanLast.length > 80) {
    return new NextResponse("Invalid worker name", { status: 400 });
  }
  const suggestedEmail = emailSuggestion(cleanEmail);
  if (suggestedEmail) {
    return new NextResponse(`Check the email address. Did you mean ${suggestedEmail}?`, { status: 400 });
  }
  if (!isValidEmail(cleanEmail)) {
    return new NextResponse("Invalid email address", { status: 400 });
  }
  const rate = hourly_rate == null || hourly_rate === "" ? null : Number(hourly_rate);
  if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 10000)) {
    return new NextResponse("Invalid hourly rate", { status: 400 });
  }

  const service = supabaseService();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin}/auth/callback?next=/set-password`;
  const { data: created, error: createErr } = await service.auth.admin.inviteUserByEmail(cleanEmail, {
    redirectTo,
    data: { first_name: cleanFirst, last_name: cleanLast, invited_by: user.id },
  });
  if (createErr || !created.user) return new NextResponse(createErr?.message ?? "create failed", { status: 500 });

  const { error: profErr } = await service.from("profiles").insert({
    id: created.user.id,
    company_id: me.company_id,
    first_name: cleanFirst,
    last_name: cleanLast,
    phone: typeof phone === "string" && phone.trim() ? phone.trim().slice(0, 40) : null,
    role: "worker",
    is_active: true,
    locale: ["et", "ru", "en", "fi"].includes(locale) ? locale : "et",
    hourly_rate: rate,
  });
  if (profErr) {
    await service.auth.admin.deleteUser(created.user.id); // rollback
    return new NextResponse(profErr.message, { status: 500 });
  }
  return NextResponse.json({ id: created.user.id, invited: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!me || me.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const userId = body?.user_id;
  if (typeof userId !== "string" || body?.confirmation !== "REJECT") {
    return new NextResponse("Explicit rejection confirmation required", { status: 400 });
  }
  const service = supabaseService();
  const { data: target } = await service.from("profiles")
    .select("company_id, role, is_approved").eq("id", userId).single();
  if (!target || target.company_id !== me.company_id || target.role !== "worker" || target.is_approved !== false) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return new NextResponse("Could not reject worker", { status: 500 });
  return NextResponse.json({ deleted: userId });
}
