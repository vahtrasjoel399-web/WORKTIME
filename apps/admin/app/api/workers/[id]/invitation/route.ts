import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendInvitationEmail } from "@/lib/invitation-email";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const RESEND_COOLDOWN_MS = 60_000;

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sisselogimine on nõutud.", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "admin") return new NextResponse("Sul pole kutse saatmiseks õigust.", { status: 403 });

  const body = await req.json().catch(() => null);
  const password = body?.password;
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return new NextResponse("Ajutine parool peab sisaldama 10–128 tähemärki.", { status: 400 });
  }

  const { id } = await context.params;
  const service = supabaseService();
  const { data: employee, error: employeeError } = await service
    .from("profiles")
    .select("id, company_id, role, email, first_name")
    .eq("id", id)
    .eq("company_id", me.company_id)
    .in("role", ["worker", "accountant"])
    .maybeSingle();
  if (employeeError) {
    console.error("Invitation employee lookup failed", { companyId: me.company_id, employeeId: id, code: employeeError.code });
    return new NextResponse("Töötaja andmeid ei õnnestunud laadida.", { status: 500 });
  }
  if (!employee) return new NextResponse("Töötajat ei leitud.", { status: 404 });

  const cooldownStart = new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString();
  const { data: recentAttempt, error: cooldownError } = await service
    .from("audit_logs")
    .select("id")
    .eq("company_id", me.company_id)
    .eq("target_id", id)
    .in("action", ["employee.invitation_sent", "employee.invitation_failed"])
    .gte("created_at", cooldownStart)
    .limit(1)
    .maybeSingle();
  if (cooldownError) {
    console.error("Invitation cooldown check failed", { companyId: me.company_id, employeeId: id, code: cooldownError.code });
    return new NextResponse("Kutse saatmist ei õnnestunud kontrollida.", { status: 500 });
  }
  if (recentAttempt) return new NextResponse("Kutse saadeti hiljuti. Oota minut ja proovi uuesti.", { status: 429 });

  const { data: authUser, error: authLookupError } = await service.auth.admin.getUserById(id);
  if (authLookupError || !authUser.user) {
    console.error("Invitation auth user lookup failed", { companyId: me.company_id, employeeId: id, code: "auth_provider_failure" });
    return new NextResponse("Kasutajakontot ei õnnestunud uuendada.", { status: 502 });
  }
  const { error: passwordError } = await service.auth.admin.updateUserById(id, {
    password,
    user_metadata: { ...authUser.user.user_metadata, force_password_change: true },
  });
  if (passwordError) {
    console.error("Invitation temporary password update failed", { companyId: me.company_id, employeeId: id, code: "auth_provider_failure" });
    return new NextResponse("Ajutist parooli ei õnnestunud uuendada.", { status: 502 });
  }

  const invitation = await sendInvitationEmail({
    employeeId: id,
    email: employee.email,
    firstName: employee.first_name,
    temporaryPassword: password,
    idempotencyKey: `employee-invitation/${id}/${randomUUID()}`,
  });
  const { error: auditError } = await service.from("audit_logs").insert({
    company_id: me.company_id,
    actor_id: user.id,
    action: invitation.ok ? "employee.invitation_sent" : "employee.invitation_failed",
    target_type: employee.role,
    target_id: id,
    metadata: invitation.ok ? { provider: "resend", message_id: invitation.messageId } : { provider: "resend", error_code: invitation.code },
  });
  if (auditError) console.error("Invitation audit write failed", { companyId: me.company_id, employeeId: id, code: auditError.code });
  if (!invitation.ok) {
    console.error("Employee invitation resend failed", { companyId: me.company_id, employeeId: id, code: invitation.code });
    return new NextResponse(invitation.message, { status: 502 });
  }
  return NextResponse.json({ sent: true });
}
