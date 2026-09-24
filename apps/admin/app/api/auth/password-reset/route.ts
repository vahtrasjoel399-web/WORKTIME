import { NextRequest, NextResponse } from "next/server";
import { emailSuggestion, isValidEmail, normalizeEmail } from "@/lib/email";
import { supabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function appOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
        return url.origin;
      }
    } catch { /* use request origin */ }
  }
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email) || emailSuggestion(email)) {
    return NextResponse.json({ code: "invalid_email" }, { status: 400 });
  }

  const service = supabaseService();
  const { data: profile, error: lookupError } = await service
    .from("profiles")
    .select("id, is_active")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("Password reset account lookup failed", { code: lookupError.code });
    return NextResponse.json({ code: "service_unavailable" }, { status: 503 });
  }
  if (!profile || !profile.is_active) {
    return NextResponse.json({ code: "account_not_found" }, { status: 404 });
  }

  const { error: resetError } = await service.auth.resetPasswordForEmail(email, {
    redirectTo: `${appOrigin(req)}/auth/callback?next=/set-password`,
  });
  if (resetError) {
    console.error("Password reset request failed", { userId: profile.id, code: resetError.status ?? "provider_failure" });
    const limited = resetError.status === 429 || /rate limit/i.test(resetError.message);
    return NextResponse.json({ code: limited ? "rate_limited" : "service_unavailable" }, { status: limited ? 429 : 502 });
  }

  return NextResponse.json({ ok: true });
}
