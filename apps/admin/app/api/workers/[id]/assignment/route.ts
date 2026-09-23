import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";
import { sendAssignmentEmail } from "@/lib/assignment-email";
import type { WorkerRate } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("company_id, role").eq("id", user.id).single();
  if (!me || me.role !== "admin") return new NextResponse("Forbidden", { status: 403 });
  const body = await req.json().catch(() => null);
  const siteId = typeof body?.site_id === "string" && body.site_id ? body.site_id : null;
  const { data: assignment, error } = await supabase.rpc("set_employee_assignment", { p_employee_id: id, p_site_id: siteId });
  if (error) return new NextResponse("Objekti määramine ebaõnnestus.", { status: 400 });
  if (!siteId) return NextResponse.json({ assignment, notification: "not_required" });

  const service = supabaseService();
  const [{ data: employee }, { data: site }, { data: rates }] = await Promise.all([
    service.from("profiles").select("email, first_name").eq("id", id).eq("company_id", me.company_id).single(),
    service.from("sites").select("name, address").eq("id", siteId).eq("company_id", me.company_id).single(),
    service.from("worker_rates").select("*").eq("employee_id", id).eq("is_active", true).or(`site_id.is.null,site_id.eq.${siteId}`),
  ]);
  if (!employee?.email || !site) return NextResponse.json({ assignment, notification: "skipped" });
  const notification = await sendAssignmentEmail({ email: employee.email, firstName: employee.first_name, siteName: site.name, siteAddress: site.address, rates: (rates ?? []) as WorkerRate[], idempotencyKey: `assignment/${assignment}` });
  await service.from("audit_logs").insert({ company_id: me.company_id, actor_id: user.id, action: notification.ok ? "employee.assignment_email_sent" : "employee.assignment_email_failed", target_type: "employee_assignment", target_id: assignment, metadata: notification.ok ? { provider: "resend", message_id: notification.messageId } : { provider: "resend", error_code: notification.code } });
  return NextResponse.json({ assignment, notification: notification.ok ? "sent" : "failed", message: notification.ok ? undefined : notification.message });
}
