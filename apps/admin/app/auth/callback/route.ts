import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const requestedNext = req.nextUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;
  if (!code) return NextResponse.redirect(new URL("/login?auth_error=missing_code", req.url));

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(new URL("/login?auth_error=invalid_link", req.url));

  const { data: existing } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!existing) {
    const meta = data.user.user_metadata ?? {};
    if (meta.registration_kind === "worker") {
      const { error: registrationError } = await supabase.rpc("register_worker", {
        p_join_code: String(meta.join_code ?? ""),
        worker_first: String(meta.first_name ?? ""),
        worker_last: String(meta.last_name ?? ""),
      });
      if (registrationError) return NextResponse.redirect(new URL("/login?auth_error=registration", req.url));
    } else if (meta.registration_kind === "company") {
      const { error: registrationError } = await supabase.rpc("register_company", {
        company_name: String(meta.company_name ?? ""),
        admin_first: String(meta.first_name ?? ""),
        admin_last: String(meta.last_name ?? ""),
      });
      if (registrationError) return NextResponse.redirect(new URL("/login?auth_error=registration", req.url));
    }
  }

  if (next) return NextResponse.redirect(new URL(next, req.url));
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return NextResponse.redirect(new URL(profile?.role === "admin" ? "/" : "/me", req.url));
}
