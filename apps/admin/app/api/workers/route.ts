import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";
import { emailSuggestion, isValidEmail, normalizeEmail } from "@/lib/email";
import { buildManagedProfile } from "@/lib/managed-profile";
import type { PricingType } from "@/lib/pricing";
import { sendInvitationEmail } from "@/lib/invitation-email";

export const dynamic = "force-dynamic";

function tallinnDate(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// Creates a managed worker or accountant account. Only an authenticated admin can
// choose the role and initial password; the user must replace it on first login.
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!me || me.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const { first_name, last_name, email, password, role, phone, position, initial_site_id, hourly_rate, pricing_type, pricing_unit, locale } = body ?? {};
  const accountRole = role === "accountant" ? "accountant" : role === "worker" ? "worker" : null;
  if (!accountRole) return new NextResponse("Invalid account role", { status: 400 });
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return new NextResponse("Temporary password must contain 10–128 characters", { status: 400 });
  }
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
  const cleanPhone = typeof phone === "string" ? phone.trim() : "";
  const cleanPosition = typeof position === "string" ? position.trim() : "";
  const initialSiteId = typeof initial_site_id === "string" ? initial_site_id.trim() : "";
  if (cleanPhone.length > 40) return new NextResponse("Invalid phone number", { status: 400 });
  if (cleanPosition.length > 120) return new NextResponse("Invalid position", { status: 400 });
  const rate = hourly_rate == null || hourly_rate === "" ? null : Number(hourly_rate);
  if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 10000)) {
    return new NextResponse("Invalid hourly rate", { status: 400 });
  }
  const pricingType: PricingType = ["hourly", "area", "quantity"].includes(pricing_type) ? pricing_type : "hourly";
  const pricingUnit = typeof pricing_unit === "string" ? pricing_unit.trim() : "";
  if (accountRole === "worker" && pricingType === "quantity" && (!pricingUnit || pricingUnit.length > 24)) {
    return new NextResponse("Quantity pricing requires a valid unit", { status: 400 });
  }

  if (accountRole === "worker" && initialSiteId) {
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("id", initialSiteId)
      .eq("company_id", me.company_id)
      .eq("status", "active")
      .maybeSingle();
    if (!site) return new NextResponse("Invalid initial object", { status: 400 });
  }

  const service = supabaseService();
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: cleanFirst,
      last_name: cleanLast,
      created_by: user.id,
      force_password_change: true,
    },
  });
  if (createErr || !created.user) {
    const duplicate = /already|registered|exists/i.test(createErr?.message ?? "");
    if (!duplicate) console.error("Managed account creation failed", { companyId: me.company_id, code: "auth_provider_failure" });
    return new NextResponse(duplicate ? "An account with this email already exists" : "Authentication provider could not create the account", { status: duplicate ? 409 : 502 });
  }

  const profile = buildManagedProfile({
    id: created.user.id,
    companyId: me.company_id,
    firstName: cleanFirst,
    lastName: cleanLast,
    email: cleanEmail,
    phone: cleanPhone,
    position: cleanPosition,
    initialSiteId,
    role: accountRole,
    locale,
    rate,
    pricingType,
    pricingUnit,
  });
  const { error: profErr } = await service.from("profiles").insert(profile);
  if (profErr) {
    await service.auth.admin.deleteUser(created.user.id); // rollback
    console.error("Managed profile creation failed", { companyId: me.company_id, employeeId: created.user.id, code: profErr.code });
    return new NextResponse("Could not save the employee profile", { status: 500 });
  }

  let initialAssignmentId: string | null = null;
  if (accountRole === "worker" && initialSiteId) {
    const { data: assignment, error: assignmentError } = await service
      .from("employee_assignments")
      .insert({
        company_id: me.company_id,
        employee_id: created.user.id,
        site_id: initialSiteId,
        start_date: tallinnDate(),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (assignmentError) {
      await service.auth.admin.deleteUser(created.user.id);
      console.error("Initial assignment creation failed", { companyId: me.company_id, employeeId: created.user.id, code: assignmentError.code });
      return new NextResponse("Could not save the initial assignment", { status: 500 });
    }
    initialAssignmentId = assignment.id;
  }

  const auditRows = [
    {
      company_id: me.company_id,
      actor_id: user.id,
      action: accountRole === "worker" ? "employee.created" : "accountant.created",
      target_type: accountRole,
      target_id: created.user.id,
      metadata: {},
    },
    ...(accountRole === "worker" && initialSiteId
      ? [{
          company_id: me.company_id,
          actor_id: user.id,
          action: "employee.assigned_to_object",
          target_type: "employee_assignment",
          target_id: initialAssignmentId,
          metadata: { employee_id: created.user.id, site_id: initialSiteId },
        }]
      : []),
  ];
  const { error: auditError } = await service.from("audit_logs").insert(auditRows);
  if (auditError) {
    await service.auth.admin.deleteUser(created.user.id);
    return new NextResponse("Could not record employee creation", { status: 500 });
  }

  const invitation = await sendInvitationEmail({
    employeeId: created.user.id,
    email: cleanEmail,
    firstName: cleanFirst,
    temporaryPassword: password,
    idempotencyKey: `employee-welcome/${created.user.id}`,
  });
  const invitationAction = invitation.ok ? "employee.invitation_sent" : "employee.invitation_failed";
  const { error: invitationAuditError } = await service.from("audit_logs").insert({
    company_id: me.company_id,
    actor_id: user.id,
    action: invitationAction,
    target_type: accountRole,
    target_id: created.user.id,
    metadata: invitation.ok ? { provider: "resend", message_id: invitation.messageId } : { provider: "resend", error_code: invitation.code },
  });
  if (!invitation.ok) {
    console.error("Employee invitation email failed", { companyId: me.company_id, employeeId: created.user.id, code: invitation.code });
  }
  if (invitationAuditError) {
    console.error("Invitation audit write failed", { companyId: me.company_id, employeeId: created.user.id, code: invitationAuditError.code });
  }

  return NextResponse.json({
    id: created.user.id,
    role: accountRole,
    created: true,
    invitation: invitation.ok
      ? { status: "sent" as const }
      : { status: "failed" as const, code: invitation.code, message: invitation.message },
  }, { status: 201 });
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
