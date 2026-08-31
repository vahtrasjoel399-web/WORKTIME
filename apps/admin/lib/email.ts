const DOMAIN_FIXES: Record<string, string> = {
  "gmail.con": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmeil.com": "gmail.com",
  "gmeil.cok": "gmail.com",
  "gmail.cok": "gmail.com",
  "hotmail.con": "hotmail.com",
  "hotnail.com": "hotmail.com",
  "outlook.con": "outlook.com",
  "icloud.con": "icloud.com",
  "yahoo.con": "yahoo.com",
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailSuggestion(value: string): string | null {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const fixed = DOMAIN_FIXES[domain]
    ?? (domain.endsWith(".con") || domain.endsWith(".cok") ? `${domain.slice(0, -4)}.com` : null);
  return fixed && fixed !== domain ? `${local}@${fixed}` : null;
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) && !emailSuggestion(email);
}
