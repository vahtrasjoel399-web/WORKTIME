import assert from "node:assert/strict";
import test from "node:test";
import { forcedPasswordRedirect } from "./auth-routing.ts";

test("a managed user cannot navigate around the initial password page", () => {
  const metadata = { force_password_change: true };
  assert.equal(forcedPasswordRedirect("/", metadata), "/set-password?initial=1");
  assert.equal(forcedPasswordRedirect("/workers", metadata), "/set-password?initial=1");
  assert.equal(forcedPasswordRedirect("/api/reports", metadata), "/set-password?initial=1");
  assert.equal(forcedPasswordRedirect("/set-password", metadata), null);
});

test("normal navigation resumes after password replacement", () => {
  assert.equal(forcedPasswordRedirect("/", { force_password_change: false }), null);
  assert.equal(forcedPasswordRedirect("/", undefined), null);
});
