import assert from "node:assert/strict";
import test from "node:test";

import { buildManagedProfile } from "./managed-profile.ts";

const baseInput = {
  id: "user-1",
  companyId: "company-1",
  firstName: "Mari",
  lastName: "Maasikas",
  email: "mari@example.com",
  phone: "",
  position: "",
  initialSiteId: "site-1",
  locale: "et",
  rate: 18.5,
  pricingType: "hourly" as const,
  pricingUnit: "",
};

test("accountant profile omits pricing columns for pre-pricing schemas", () => {
  const profile = buildManagedProfile({ ...baseInput, role: "accountant" });

  assert.equal(profile.role, "accountant");
  assert.equal(profile.default_site_id, null);
  assert.equal(profile.hourly_rate, null);
  assert.equal(Object.hasOwn(profile, "pricing_type"), false);
  assert.equal(Object.hasOwn(profile, "pricing_unit"), false);
});

test("worker profile includes hourly pricing configuration", () => {
  const profile = buildManagedProfile({ ...baseInput, role: "worker" });

  assert.equal(profile.role, "worker");
  assert.equal(profile.default_site_id, "site-1");
  assert.equal(profile.hourly_rate, 18.5);
  assert.equal(profile.pricing_type, "hourly");
  assert.equal(profile.pricing_unit, null);
});

test("quantity worker profile keeps its configured unit", () => {
  const profile = buildManagedProfile({
    ...baseInput,
    role: "worker",
    pricingType: "quantity",
    pricingUnit: "tk",
  });

  assert.equal(profile.pricing_type, "quantity");
  assert.equal(profile.pricing_unit, "tk");
});

test("unsupported locale falls back to Estonian", () => {
  const profile = buildManagedProfile({ ...baseInput, role: "worker", locale: "de" });

  assert.equal(profile.locale, "et");
});
