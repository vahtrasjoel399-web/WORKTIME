import assert from "node:assert/strict";
import test from "node:test";

import { earningsFor, pricingTotal, resolveRate, savedShiftTotal } from "./earnings.ts";
import { elapsedSeconds, hms, hoursDecimal, workedSeconds } from "./time.ts";

test("rate resolution prefers the employer rate", () => {
  assert.deepEqual(resolveRate(20, 15), { rate: 20, source: "company" });
  assert.deepEqual(resolveRate(null, 15), { rate: 15, source: "personal" });
  assert.deepEqual(resolveRate(null, null), { rate: null, source: "none" });
});

test("mobile earnings calculate hourly and quantity pricing", () => {
  assert.equal(earningsFor(5400, 20), 30);
  assert.equal(earningsFor(3600, null), 0);
  assert.equal(pricingTotal("hourly", 18, 5400), 27);
  assert.equal(pricingTotal("area", 2.5, 0, 12), 30);
  assert.equal(pricingTotal("quantity", -1, 0, 12), null);
});

test("saved shift totals take precedence and otherwise use fallback rates", () => {
  assert.equal(savedShiftTotal({ calculated_total: 41.25 }, 3600, 10), 41.25);
  assert.equal(savedShiftTotal({ pricing_type: "hourly" }, 7200, 16), 32);
  assert.equal(savedShiftTotal({ pricing_type: "quantity", quantity: null }, 0, 16), 0);
});

test("time helpers subtract breaks and clamp negative results", () => {
  const start = "2026-09-21T08:00:00.000Z";
  const end = "2026-09-21T10:30:00.000Z";
  assert.equal(workedSeconds(start, end, 1800), 7200);
  assert.equal(workedSeconds(start, null, 0), 0);
  assert.equal(elapsedSeconds(start, 1800, Date.parse(end)), 7200);
  assert.equal(elapsedSeconds(end, 0, Date.parse(start)), 0);
  assert.equal(hms(3661.9), "01:01:01");
  assert.equal(hoursDecimal(4500), 1.25);
});
