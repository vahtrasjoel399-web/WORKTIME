import { isValidEmail, normalizeEmail } from "./email.ts";
import { isValidSender, mapResendFailure, resolveAppUrl, type InvitationEmailResult } from "./invitation-email.ts";
import type { WorkerRate } from "./types.ts";
import { pricingUnit } from "./pricing.ts";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export async function sendAssignmentEmail(input: {
  email: string; firstName: string; siteName: string; siteAddress?: string | null;
  rates: WorkerRate[]; idempotencyKey: string;
}): Promise<InvitationEmailResult> {
  const recipient = normalizeEmail(input.email);
  if (!isValidEmail(recipient)) return { ok: false, code: "invalid_recipient", message: "Kontrolli töötaja e-posti aadressi." };
  const apiKey = process.env.RESEND_API_KEY ?? "";
  if (!apiKey) return { ok: false, code: "missing_api_key", message: "E-posti teenus pole seadistatud." };
  const from = process.env.EMAIL_FROM ?? "";
  if (!isValidSender(from)) return { ok: false, code: "invalid_sender", message: "Saatja aadress pole seadistatud." };
  const appUrl = resolveAppUrl();
  if (!appUrl) return { ok: false, code: "invalid_app_url", message: "WorkTime’i veebiaadress pole seadistatud." };
  const rows = input.rates.length ? input.rates.map((r) => `${r.label}: ${Number(r.rate).toFixed(2)} ${r.currency}/${pricingUnit(r.pricing_type, r.unit)} neto`) : ["Tasustamise tingimused täpsustab tööandja."];
  const htmlRows = rows.map((row) => `<li style="margin:0 0 6px">${esc(row)}</li>`).join("");
  const html = `<!doctype html><html lang="et"><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#17202a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e5e7eb;border-radius:12px"><tr><td style="padding:28px"><div style="font-size:20px;font-weight:700;color:#16324f">WorkTime</div><h1 style="font-size:24px">Uus tööobjekt</h1><p>Tere, ${esc(input.firstName)}! Sind määrati objektile <strong>${esc(input.siteName)}</strong>.</p>${input.siteAddress ? `<p style="color:#667085">${esc(input.siteAddress)}</p>` : ""}<h2 style="font-size:17px">Sinu netohinnad sellel objektil</h2><ul style="padding-left:22px">${htmlRows}</ul><a href="${esc(appUrl)}/login" style="display:inline-block;margin-top:16px;padding:13px 22px;border-radius:8px;background:#176b57;color:#fff;text-decoration:none;font-weight:700">Ava WorkTime</a></td></tr></table></td></tr></table></body></html>`;
  const text = `Tere, ${input.firstName}!\n\nSind määrati objektile: ${input.siteName}${input.siteAddress ? `\nAadress: ${input.siteAddress}` : ""}\n\nSinu netohinnad:\n${rows.map((r) => `- ${r}`).join("\n")}\n\nAva WorkTime: ${appUrl}/login`;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey.slice(0, 256) }, body: JSON.stringify({ from: from.trim(), to: [recipient], subject: `WorkTime: ${input.siteName}`, html, text }), signal: AbortSignal.timeout(10_000) });
    const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (!response.ok || !payload?.id) return mapResendFailure(response.status, payload);
    return { ok: true, messageId: payload.id };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { ok: false, code: "timeout", message: "E-posti teenus ei vastanud õigel ajal." };
    return { ok: false, code: "network_error", message: "E-posti teenusega ei saadud ühendust." };
  }
}
