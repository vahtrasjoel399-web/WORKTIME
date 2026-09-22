export function forcedPasswordRedirect(pathname: string, userMetadata: Record<string, unknown> | undefined): string | null {
  const mustChangePassword = userMetadata?.force_password_change === true;
  const isPasswordPage = pathname.startsWith("/set-password");
  return mustChangePassword && !isPasswordPage ? "/set-password?initial=1" : null;
}
