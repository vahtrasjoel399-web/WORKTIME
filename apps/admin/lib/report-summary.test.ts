import assert from "node:assert/strict";
import test from "node:test";
import { quantityParts, summarizeClientInvoice, summarizeSites, summarizeWorkers, type ReportShift } from "./report-summary.ts";

const shifts: ReportShift[] = [
  { id: "1", user_id: "w", site_id: "a", site_name: "A", site_address: "Street 1", work_date: "2026-09-01", started_at: "2026-09-01T08:00:00Z", worked_seconds: 28800, pricing_type: "hourly", pricing_rate: 12, quantity: null, unit: null, calculated_total: 96, is_net: true, client_pricing_rate: 25, client_calculated_total: 200 },
  { id: "2", user_id: "w", site_id: "a", site_name: "A", site_address: "Street 1", work_date: "2026-09-02", started_at: "2026-09-02T08:00:00Z", worked_seconds: 21600, pricing_type: "area", pricing_rate: 2.5, pricing_label: "Paigaldus", quantity: 45, unit: "m²", calculated_total: 112.5, is_net: true, client_pricing_rate: 5, client_calculated_total: 225 },
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
  assert.equal(sites.find((site) => site.id === "a")?.clientAmount, 425);
  assert.equal(sites.find((site) => site.id === "b")?.missingClientPrices, 1);
  const invoice = summarizeClientInvoice(shifts);
  assert.equal(invoice.length, 2);
  assert.equal(invoice.find((row) => row.label === "Paigaldus")?.amount, 225);
});

test("client invoice groups workers once and preserves historical rates", () => {
  const rows: ReportShift[] = [
    { id: "old-a", user_id: "w1", site_id: "a", site_name: "A", work_date: "2026-09-10", started_at: "2026-09-10T08:00:00Z", worked_seconds: 3600, pricing_type: "area", pricing_label: "Paigaldus", pricing_rate: 2, quantity: 40, unit: "m²", calculated_total: 80, client_pricing_rate: 5, client_calculated_total: 200 },
    { id: "old-b", user_id: "w2", site_id: "a", site_name: "A", work_date: "2026-09-10", started_at: "2026-09-10T08:00:00Z", worked_seconds: 3600, pricing_type: "area", pricing_label: "Paigaldus", pricing_rate: 2, quantity: 60, unit: "m²", calculated_total: 120, client_pricing_rate: 5, client_calculated_total: 300 },
    { id: "new", user_id: "w1", site_id: "a", site_name: "A", work_date: "2026-10-10", started_at: "2026-10-10T08:00:00Z", worked_seconds: 3600, pricing_type: "area", pricing_label: "Paigaldus", pricing_rate: 2.5, quantity: 10, unit: "m²", calculated_total: 25, client_pricing_rate: 6, client_calculated_total: 60 },
    { id: "pieces", user_id: "w2", site_id: "a", site_name: "A", work_date: "2026-10-10", started_at: "2026-10-10T09:00:00Z", worked_seconds: 3600, pricing_type: "quantity", pricing_label: "Detailid", pricing_rate: 1, quantity: 3, unit: "tk", calculated_total: 3, client_pricing_rate: 3, client_calculated_total: 9 },
  ];
  const invoice = summarizeClientInvoice(rows);
  assert.equal(invoice.length, 3);
  const september = invoice.find((row) => row.label === "Paigaldus" && row.rate === 5);
  assert.equal(september?.quantity, 100);
  assert.equal(september?.amount, 500);
  assert.equal(invoice.reduce((sum, row) => sum + row.amount, 0), 569);
});
