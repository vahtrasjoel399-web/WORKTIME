import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Creates a worker account (no self sign-up exists). The admin's company is read
// from their own session; the new auth user + profile are created with the service
// role, then the worker signs in with the emailed temporary password.
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!me || me.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json();
  const { first_name, last_name, email, phone, hourly_rate, locale, temp_password } = body;
  if (!email || !first_name) return new NextResponse("email and first_name required", { status: 400 });

  const service = supabaseService();
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    phone: phone || undefined,
    password: temp_password || Math.random().toString(36).slice(2) + "A1!",
    email_confirm: true,
  });
  if (createErr || !created.user) return new NextResponse(createErr?.message ?? "create failed", { status: 500 });

  const { error: profErr } = await service.from("profiles").insert({
    id: created.user.id,
    company_id: me.company_id,
    first_name,
    last_name: last_name ?? "",
    phone: phone ?? null,
    role: "worker",
    is_active: true,
    locale: locale ?? "et",
    hourly_rate: hourly_rate ?? null,
  });
  if (profErr) {
    await service.auth.admin.deleteUser(created.user.id); // rollback
    return new NextResponse(profErr.message, { status: 500 });
  }
  return NextResponse.json({ id: created.user.id });
}
