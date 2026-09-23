import { isValidEmail, normalizeEmail } from "./email.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

export type InvitationEmailCode =
  | "invalid_recipient"
  | "missing_api_key"
  | "invalid_sender"
  | "invalid_app_url"
  | "invalid_api_key"
  | "unverified_sender"
  | "test_recipient_restricted"
  | "rate_limited"
  | "timeout"
  | "provider_rejected"
  | "network_error";

export type InvitationEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; code: InvitationEmailCode; message: string };

export type InvitationEmailInput = {
  employeeId: string;
  email: string;
  firstName: string;
  temporaryPassword: string;
  idempotencyKey: string;
};

type ResendErrorPayload = { name?: unknown; message?: unknown; statusCode?: unknown } | null;

export function mapResendFailure(status: number, payload: ResendErrorPayload): InvitationEmailResult {
  const detail = typeof payload?.message === "string" ? payload.message.toLowerCase() : "";
  if (status === 401 || detail.includes("api key")) {
    return { ok: false, code: "invalid_api_key", message: "Resend API-võti ei kehti. Loo Resendis uus Sending access võti ja uuenda Vercelis RESEND_API_KEY väärtust." };
  }
  if (detail.includes("only send") || detail.includes("your own email") || detail.includes("testing email")) {
    return { ok: false, code: "test_recipient_restricted", message: "Resendi test-saatja saab saata ainult konto omaniku aadressile või delivered@resend.dev testaadressile. Teistele töötajatele saatmiseks kinnita oma domeen." };
  }
  if (detail.includes("domain") || detail.includes("verify") || detail.includes("from address") || detail.includes("sender")) {
    return { ok: false, code: "unverified_sender", message: "Resend ei luba seda saatja aadressi. Kontrolli, et EMAIL_FROM kasutaks Resendis kinnitatud domeeni, või testi aadressiga WorkTime <onboarding@resend.dev>." };
  }
  if (status === 429) {
    return { ok: false, code: "rate_limited", message: "Resendi saatmislimiit sai täis. Oota hetk ja proovi uuesti." };
  }
  return { ok: false, code: "provider_rejected", message: "Resend lükkas kirja tagasi. Ava Resend → Logs, kontrolli viimase päringu põhjust ja proovi uuesti." };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function isValidSender(value: string): boolean {
  const sender = value.trim();
  const named = sender.match(/^([^<>\r\n]+)\s+<([^<>\s]+)>$/);
  return named ? Boolean(named[1].trim()) && isValidEmail(named[2]) : isValidEmail(sender);
}

export function resolveAppUrl(value = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ""): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function buildInvitationEmail(input: Pick<InvitationEmailInput, "email" | "firstName" | "temporaryPassword"> & { appUrl: string }) {
  const firstName = escapeHtml(input.firstName);
  const email = escapeHtml(input.email);
  const password = escapeHtml(input.temporaryPassword);
  const loginUrl = `${input.appUrl}/login`;
  const safeLoginUrl = escapeHtml(loginUrl);
  const subject = "Tere tulemast WorkTime’i";
  const html = `<!doctype html>
<html lang="et"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#17202a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
      <tr><td style="padding:28px 28px 12px"><div style="font-size:20px;font-weight:700;color:#16324f">WorkTime</div></td></tr>
      <tr><td style="padding:8px 28px 28px">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">Tere, ${firstName}!</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6">Sulle on loodud WorkTime’i konto. Logi sisse allolevate ajutiste andmetega.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px">
          <tr><td style="padding:16px;font-size:14px;line-height:1.7"><strong>E-post:</strong> ${email}<br><strong>Ajutine parool:</strong> ${password}</td></tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:8px;background:#176b57"><a href="${safeLoginUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700">Ava WorkTime</a></td></tr></table>
        <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#667085">Turvalisuse huvides palutakse sul esimesel sisselogimisel ajutine parool uue vastu vahetada. Ära jaga neid andmeid teistega.</p>
        <h2 style="margin:24px 0 10px;font-size:18px;line-height:1.35;color:#17202a">Kuidas WorkTime’i kasutada?</h2>
        <ol style="margin:0;padding:0 0 0 22px;font-size:14px;line-height:1.7;color:#344054">
          <li style="margin:0 0 6px">Ava WorkTime ja logi sisse selle e-posti ning ajutise parooliga.</li>
          <li style="margin:0 0 6px">Esimesel sisselogimisel loo endale uus turvaline parool.</li>
          <li style="margin:0 0 6px">Luba rakendusele asukohale juurdepääs. Asukoht salvestatakse ainult vahetuse alustamisel ja lõpetamisel.</li>
          <li style="margin:0 0 6px">Tööle jõudes kontrolli ekraanil olevat objekti ja vajuta „Alusta vahetust“.</li>
          <li style="margin:0 0 6px">Töö lõpetamisel vajuta „Lõpeta vahetus“ ja kinnita lõpetamine.</li>
          <li>Oma töötunde ja lõpetatud vahetusi näed töötundide vaatest.</li>
        </ol>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const text = `Tere, ${input.firstName}!\n\nSulle on loodud WorkTime’i konto.\n\nE-post: ${input.email}\nAjutine parool: ${input.temporaryPassword}\n\nLogi sisse: ${loginUrl}\n\nEsimesel sisselogimisel pead ajutise parooli uue vastu vahetama. Ära jaga neid andmeid teistega.\n\nKuidas WorkTime’i kasutada?\n\n1. Ava WorkTime ja logi sisse selle e-posti ning ajutise parooliga.\n2. Esimesel sisselogimisel loo endale uus turvaline parool.\n3. Luba rakendusele asukohale juurdepääs. Asukoht salvestatakse ainult vahetuse alustamisel ja lõpetamisel.\n4. Tööle jõudes kontrolli ekraanil olevat objekti ja vajuta „Alusta vahetust“.\n5. Töö lõpetamisel vajuta „Lõpeta vahetus“ ja kinnita lõpetamine.\n6. Oma töötunde ja lõpetatud vahetusi näed töötundide vaatest.`;
  return { subject, html, text };
}

export async function sendInvitationEmail(
  input: InvitationEmailInput,
  options: { fetch?: typeof fetch; apiKey?: string; from?: string; appUrl?: string; timeoutMs?: number } = {},
): Promise<InvitationEmailResult> {
  const recipient = normalizeEmail(input.email);
  if (!isValidEmail(recipient)) return { ok: false, code: "invalid_recipient", message: "Kontrolli töötaja e-posti aadressi." };
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY ?? "";
  if (!apiKey.trim()) return { ok: false, code: "missing_api_key", message: "E-posti teenus pole seadistatud. Lisa RESEND_API_KEY." };
  const from = options.from ?? process.env.EMAIL_FROM ?? "";
  if (!isValidSender(from)) return { ok: false, code: "invalid_sender", message: "Saatja aadress pole õigesti seadistatud. Kontrolli EMAIL_FROM väärtust." };
  const appUrl = resolveAppUrl(options.appUrl);
  if (!appUrl) return { ok: false, code: "invalid_app_url", message: "WorkTime’i veebiaadress pole õigesti seadistatud." };

  const content = buildInvitationEmail({ ...input, appUrl });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const response = await (options.fetch ?? fetch)(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: from.trim(), to: [recipient], subject: content.subject, html: content.html, text: content.text }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as ({ id?: string } & NonNullable<ResendErrorPayload>) | null;
    if (!response.ok || !payload?.id) return mapResendFailure(response.status, payload);
    return { ok: true, messageId: payload.id };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, code: "timeout", message: "E-posti teenus ei vastanud õigel ajal. Proovi hetke pärast uuesti." };
    return { ok: false, code: "network_error", message: "E-posti teenusega ei saadud ühendust. Proovi hetke pärast uuesti." };
  } finally {
    clearTimeout(timeout);
  }
}
