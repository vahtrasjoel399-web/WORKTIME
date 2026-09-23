import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { isValidSender, mapResendFailure, resolveAppUrl } from "@/lib/invitation-email";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const service = supabaseService();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let checked = 0;
  let sent = 0;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return new NextResponse("Authentication provider unavailable", { status: 502 });
    for (const authUser of data.users) {
      checked += 1;
      if (Date.parse(authUser.created_at) > cutoff || authUser.last_sign_in_at || authUser.user_metadata?.force_password_change !== true || !authUser.email) continue;
      const [{ data: profile }, { count }] = await Promise.all([
        service.from("profiles").select("company_id, first_name, role").eq("id", authUser.id).maybeSingle(),
        service.from("audit_logs").select("id", { count: "exact", head: true }).eq("target_id", authUser.id).eq("action", "employee.invitation_reminder_sent"),
      ]);
      if (!profile || profile.role === "admin" || (count ?? 0) > 0) continue;
      const result = await sendReminder(authUser.email, profile.first_name, authUser.id);
      await service.from("audit_logs").insert({ company_id: profile.company_id, actor_id: null, action: result.ok ? "employee.invitation_reminder_sent" : "employee.invitation_reminder_failed", target_type: profile.role, target_id: authUser.id, metadata: result.ok ? { provider: "resend", message_id: result.id } : { provider: "resend", error_code: result.code } });
      if (result.ok) sent += 1;
    }
    if (data.users.length < 100) break;
  }
  return NextResponse.json({ checked, sent });
}

async function sendReminder(email: string, firstName: string, userId: string): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const key = process.env.RESEND_API_KEY ?? "";
  const from = process.env.EMAIL_FROM ?? "";
  const appUrl = resolveAppUrl();
  if (!key || !isValidSender(from) || !appUrl) return { ok: false, code: "configuration" };
  const safeName = firstName.replace(/[&<>"']/g, "");
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `invitation-reminder/${userId}` }, body: JSON.stringify({ from, to: [email], subject: "Meeldetuletus: lõpeta WorkTime’i konto seadistamine", html: `<p>Tere, ${safeName}!</p><p>Sinu WorkTime’i konto ootab esimest sisselogimist ja parooli vahetamist.</p><p><a href="${appUrl}/login">Ava WorkTime</a></p><p>Kasuta algses tervituskirjas saadetud ajutist parooli. Kui sa kirja ei leia, võta ühendust tööandjaga.</p>`, text: `Tere, ${firstName}!\n\nSinu WorkTime’i konto ootab esimest sisselogimist ja parooli vahetamist.\n\nAva WorkTime: ${appUrl}/login\n\nKasuta algses tervituskirjas saadetud ajutist parooli. Kui sa kirja ei leia, võta ühendust tööandjaga.` }), signal: AbortSignal.timeout(10_000) });
    const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (!response.ok || !payload?.id) { const failure = mapResendFailure(response.status, payload); return { ok: false, code: failure.ok ? "provider" : failure.code }; }
    return { ok: true, id: payload.id };
  } catch { return { ok: false, code: "network_error" }; }
}
