import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitationEmail, isValidSender, mapResendFailure, resolveAppUrl, sendInvitationEmail } from "./invitation-email.ts";

test("sender validation accepts Resend syntax and rejects malformed configuration", () => {
  assert.equal(isValidSender("WorkTime <onboarding@resend.dev>"), true);
  assert.equal(isValidSender("noreply@worktime.ee"), true);
  assert.equal(isValidSender("WorkTime noreply@example.com"), false);
});

test("app URL allows HTTPS and local HTTP only", () => {
  assert.equal(resolveAppUrl("https://worktime-one.vercel.app/"), "https://worktime-one.vercel.app");
  assert.equal(resolveAppUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(resolveAppUrl("http://worktime.example"), null);
});

test("HTML template escapes credentials and provides plain text", () => {
  const email = buildInvitationEmail({ firstName: "<Joel>", email: "joel@example.com", temporaryPassword: "A&B<123456", appUrl: "https://worktime.example" });
  assert.match(email.html, /&lt;Joel&gt;/);
  assert.match(email.html, /A&amp;B&lt;123456/);
  assert.doesNotMatch(email.html, /<Joel>/);
  assert.match(email.text, /Ajutine parool: A&B<123456/);
  assert.match(email.text, /https:\/\/worktime\.example\/login/);
});

test("send returns a safe missing-key error without a request", async () => {
  let called = false;
  const result = await sendInvitationEmail({ employeeId: "id", email: "joel@example.com", firstName: "Joel", temporaryPassword: "VeryLongPassword", idempotencyKey: "welcome/id" }, {
    apiKey: "",
    from: "WorkTime <onboarding@resend.dev>",
    appUrl: "https://worktime.example",
    fetch: async () => { called = true; throw new Error("should not run"); },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "missing_api_key");
  assert.equal(called, false);
});

test("send uses text fallback and an idempotency key", async () => {
  let request: RequestInit | undefined;
  const result = await sendInvitationEmail({ employeeId: "employee-id", email: "joel@example.com", firstName: "Joel", temporaryPassword: "VeryLongPassword", idempotencyKey: "welcome/employee-id" }, {
    apiKey: "re_test",
    from: "WorkTime <onboarding@resend.dev>",
    appUrl: "https://worktime.example",
    fetch: async (_url, init) => { request = init; return new Response(JSON.stringify({ id: "email-id" }), { status: 200 }); },
  });
  assert.deepEqual(result, { ok: true, messageId: "email-id" });
  assert.equal((request?.headers as Record<string, string>)["Idempotency-Key"], "welcome/employee-id");
  const body = JSON.parse(String(request?.body));
  assert.match(body.text, /Ajutine parool/);
  assert.match(body.html, /Ava WorkTime/);
});

test("send maps provider rejection without exposing its response", async () => {
  const result = await sendInvitationEmail({ employeeId: "id", email: "joel@example.com", firstName: "Joel", temporaryPassword: "VeryLongPassword", idempotencyKey: "welcome/id" }, {
    apiKey: "re_test",
    from: "WorkTime <onboarding@resend.dev>",
    appUrl: "https://worktime.example",
    fetch: async () => new Response(JSON.stringify({ message: "secret provider detail" }), { status: 422 }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "provider_rejected");
    assert.doesNotMatch(result.message, /secret provider detail/);
  }
});

test("Resend failures distinguish invalid keys, test recipients, domains, and rate limits", () => {
  assert.equal(mapResendFailure(401, { message: "Invalid API key: re_secret" }).ok, false);
  assert.deepEqual(mapResendFailure(401, { message: "Invalid API key: re_secret" }), {
    ok: false,
    code: "invalid_api_key",
    message: "Resend API-võti ei kehti. Loo Resendis uus Sending access võti ja uuenda Vercelis RESEND_API_KEY väärtust.",
  });
  const restricted = mapResendFailure(403, { message: "You can only send testing emails to your own email address" });
  assert.equal(restricted.ok ? "" : restricted.code, "test_recipient_restricted");
  const domain = mapResendFailure(403, { message: "The example.com domain is not verified" });
  assert.equal(domain.ok ? "" : domain.code, "unverified_sender");
  const limited = mapResendFailure(429, { message: "Too many requests" });
  assert.equal(limited.ok ? "" : limited.code, "rate_limited");
  assert.doesNotMatch(JSON.stringify(mapResendFailure(401, { message: "Invalid API key: re_secret" })), /re_secret/);
});

test("send maps request timeout", async () => {
  const result = await sendInvitationEmail({ employeeId: "id", email: "joel@example.com", firstName: "Joel", temporaryPassword: "VeryLongPassword", idempotencyKey: "welcome/id" }, {
    apiKey: "re_test",
    from: "WorkTime <onboarding@resend.dev>",
    appUrl: "https://worktime.example",
    timeoutMs: 1,
    fetch: async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "timeout");
});
