import assert from "node:assert/strict";
import test from "node:test";
import { quantityParts, summarizeSites, summarizeWorkers, type ReportShift } from "./report-summary.ts";

const shifts: ReportShift[] = [
  { id: "1", user_id: "w", site_id: "a", site_name: "A", site_address: "Street 1", work_date: "2026-09-01", started_at: "2026-09-01T08:00:00Z", worked_seconds: 28800, pricing_type: "hourly", pricing_rate: 12, quantity: null, unit: null, calculated_total: 96, is_net: true },
  { id: "2", user_id: "w", site_id: "a", site_name: "A", site_address: "Street 1", work_date: "2026-09-02", started_at: "2026-09-02T08:00:00Z", worked_seconds: 21600, pricing_type: "area", pricing_rate: 2.5, quantity: 45, unit: "m²", calculated_total: 112.5, is_net: true },
  { id: "3", user_id: "w", site_id: "b", site_name: "B", work_date: "2026-09-02", started_at: "2026-09-02T15:00:00Z", worked_seconds: 3600, pricing_type: "quantity", pricing_rate: 0.4, quantity: 120, unit: "tk", calculated_total: 48, is_net: false },
];

test("report summaries keep hours, units, sites and net/gross separate", () => {
  assert.deepEqual(quantityParts(shifts), ["45 m²", "120 tk"]);
  const [worker] = summarizeWorkers(shifts, [{ id: "w", first_name: "Test", last_name: "Worker", currency: "EUR" }]);
  assert.equal(worker.days, 2);
  assert.equal(worker.sites, 2);
  assert.equal(worker.hours, 15);
  assert.equal(worker.net, 208.5);
  assert.equal(worker.gross, 48);
  const sites = summarizeSites(shifts);
  assert.equal(sites.length, 2);
  assert.deepEqual(sites.find((site) => site.id === "a")?.quantityLabels, ["45 m²"]);
});
