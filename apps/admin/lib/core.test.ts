import assert from "node:assert/strict";
import test from "node:test";

import { emailSuggestion, isValidEmail, normalizeEmail } from "./email.ts";
import { distanceLabel, distanceM, matchSite, shortAddress } from "./geo.ts";
import { calculatePricingTotal, pricingUnit, shiftTotal, validPricingConfig } from "./pricing.ts";
import { isoWeek, isoWeekYear, startOfWeek, weekKey, weekRange } from "./week.ts";
import type { Site } from "./types.ts";

test("email helpers normalize, validate, and suggest common domain fixes", () => {
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(emailSuggestion("worker@gmail.con"), "worker@gmail.com");
  assert.equal(emailSuggestion("worker@example.ee"), null);
  assert.equal(isValidEmail("worker@example.ee"), true);
  assert.equal(isValidEmail("worker@gmail.con"), false);
  assert.equal(isValidEmail("missing-at-sign"), false);
});

test("pricing calculations cover hourly, area, quantity, and invalid values", () => {
  assert.equal(calculatePricingTotal({ pricingType: "hourly", rate: 12.5, workedSeconds: 7200 }), 25);
  assert.equal(calculatePricingTotal({ pricingType: "area", rate: 2.75, quantity: 10 }), 27.5);
  assert.equal(calculatePricingTotal({ pricingType: "quantity", rate: 1.333, quantity: 3 }), 4);
  assert.equal(calculatePricingTotal({ pricingType: "quantity", rate: 5, quantity: null }), null);
  assert.equal(calculatePricingTotal({ pricingType: "hourly", rate: -1, workedSeconds: 3600 }), null);
});

test("saved pricing totals win over fallbacks and units are normalized", () => {
  assert.equal(shiftTotal({ calculated_total: 42, worked_seconds: 3600 }, 10), 42);
  assert.equal(shiftTotal({ pricing_type: "hourly", worked_seconds: 5400 }, 20), 30);
  assert.equal(pricingUnit("hourly"), "h");
  assert.equal(pricingUnit("area"), "m²");
  assert.equal(pricingUnit("quantity", " tk "), "tk");
});

test("pricing validation rejects missing rates and quantity units", () => {
  assert.equal(validPricingConfig("hourly", null, null), null);
  assert.notEqual(validPricingConfig("area", null, null), null);
  assert.notEqual(validPricingConfig("quantity", 3, ""), null);
  assert.notEqual(validPricingConfig("quantity", 3, "x".repeat(25)), null);
  assert.equal(validPricingConfig("quantity", 3, "tk"), null);
});

test("ISO week helpers handle year boundaries", () => {
  const newYear = new Date("2021-01-01T15:00:00Z");
  assert.equal(startOfWeek(newYear).toISOString(), "2020-12-28T00:00:00.000Z");
  assert.equal(isoWeek(newYear), 53);
  assert.equal(isoWeekYear(newYear), 2020);
  assert.equal(weekKey(newYear), "2020-W53");
  assert.deepEqual(weekRange(newYear), { from: "2020-12-28", to: "2021-01-03" });
});

test("geography helpers find the closest in-radius site", () => {
  const site = {
    id: "site-1",
    company_id: "company-1",
    name: "Office",
    address: null,
    description: null,
    status: "active",
    lat: 59.437,
    lng: 24.7536,
    radius_m: 100,
    created_at: "",
    updated_at: "",
  } satisfies Site;

  assert.equal(distanceM(null, 24, 59, 24), null);
  assert.equal(Math.round(distanceM(site.lat, site.lng, site.lat, site.lng) ?? -1), 0);
  assert.equal(matchSite(59.4371, 24.7536, [site]).site?.id, "site-1");
  assert.equal(matchSite(59.45, 24.7536, [site]).site, null);
  assert.equal(distanceLabel(1250), "1.3 km");
  assert.equal(shortAddress("Pikk 1, Tallinn, 10133, Estonia"), "Pikk 1, Tallinn");
});
