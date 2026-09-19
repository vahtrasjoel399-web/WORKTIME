import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Invitation emails use a token hash instead of placing a session in the URL.
// Verification happens server-side so the resulting session is stored in the
// same secure cookies used by the rest of the admin/worker web application.
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");

  if (!tokenHash || type !== "invite") {
    return NextResponse.redirect(new URL("/login?auth_error=invalid_link", req.url));
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?auth_error=invalid_link", req.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "worker" || profile.is_active === false) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?auth_error=invalid_invite", req.url));
  }

  return NextResponse.redirect(new URL("/set-password", req.url));
}
