import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseService } from "@/lib/supabase-server";
import { getProfile } from "@/lib/auth";
import { hours1, money } from "@/lib/format";
import { ymd } from "@/lib/week";
import { clientShiftTotal, pricingUnit, PRICING_LABELS, shiftTotal } from "@/lib/pricing";
import { formatQuantity, summarizeClientInvoice, summarizeSites, summarizeWorkers, type ReportShift } from "@/lib/report-summary";
import type { Site } from "@/lib/types";
import { ExportButtons } from "@/components/ExportButtons";
import { EmptyState, MetricStrip, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
type Query = { from?: string; to?: string; worker?: string; site?: string; preset?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role === "worker") redirect("/me");

  const current = monthRange(new Date());
  const previous = monthRange(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)));
  const preset = query.preset === "previous" ? "previous" : query.preset === "custom" ? "custom" : "current";
  const range = preset === "previous" ? previous : preset === "custom" && validDate(query.from) && validDate(query.to) ? { from: query.from!, to: query.to! } : current;
  const supabase = await supabaseServer();
  const db = me.role === "accountant" ? supabaseService() : supabase;
  const [{ data: workersRaw }, { data: sitesRaw }] = await Promise.all([
    db.from("profiles").select("id, first_name, last_name, currency").eq("company_id", me.company_id).eq("role", "worker").order("last_name"),
    db.from("sites").select("*").eq("company_id", me.company_id).order("name"),
  ]);
  const workers = workersRaw ?? [];
  const sites = (sitesRaw ?? []) as Site[];
  const workerId = workers.some((worker) => worker.id === query.worker) ? query.worker! : "";
  const siteId = sites.some((site) => site.id === query.site) ? query.site! : "";

  let shiftsQuery = db.from("v_shift_report")
    .select("id, user_id, site_id, site_name, work_date, started_at, ended_at, worked_seconds, pricing_type, pricing_rate, pricing_label, quantity, unit, calculated_total, is_net, client_rate_id, client_pricing_rate, client_calculated_total, out_of_zone")
    .eq("company_id", me.company_id).eq("status", "closed")
    .gte("work_date", range.from).lte("work_date", range.to);
  if (workerId) shiftsQuery = shiftsQuery.eq("user_id", workerId);
  if (siteId) shiftsQuery = shiftsQuery.eq("site_id", siteId);
  let adjustmentsQuery = db.from("monthly_adjustments")
    .select("id, employee_id, site_id, period_month, amount, currency, is_net, note")
    .eq("company_id", me.company_id)
    .gte("period_month", range.from.slice(0, 7) + "-01").lte("period_month", range.to.slice(0, 7) + "-01");
  if (workerId) adjustmentsQuery = adjustmentsQuery.eq("employee_id", workerId);
  if (siteId) adjustmentsQuery = adjustmentsQuery.eq("site_id", siteId);
  const [{ data: shiftRows }, { data: adjustments }] = await Promise.all([shiftsQuery.order("started_at", { ascending: false }), adjustmentsQuery.order("period_month", { ascending: false })]);

  const siteById = new Map(sites.map((site) => [site.id, site]));
  const shifts = ((shiftRows ?? []) as ReportShift[]).map((shift) => ({ ...shift, site_address: shift.site_id ? siteById.get(shift.site_id)?.address ?? null : null, site_client_name: shift.site_id ? siteById.get(shift.site_id)?.client_name ?? null : null }));
  const visibleWorkers = workerId ? workers.filter((worker) => worker.id === workerId) : workers;
  const adjustmentTotals = new Map<string, { gross: number; net: number }>();
  for (const item of adjustments ?? []) {
    const value = adjustmentTotals.get(item.employee_id) ?? { gross: 0, net: 0 };
    if (item.is_net === false) value.gross += Number(item.amount); else value.net += Number(item.amount);
    adjustmentTotals.set(item.employee_id, value);
  }
  const rows = summarizeWorkers(shifts, visibleWorkers).map((row) => ({ ...row, gross: row.gross + (adjustmentTotals.get(row.id)?.gross ?? 0), net: row.net + (adjustmentTotals.get(row.id)?.net ?? 0), hasGross: row.hasGross || (adjustmentTotals.get(row.id)?.gross ?? 0) !== 0, hasNet: row.hasNet || (adjustmentTotals.get(row.id)?.net ?? 0) !== 0 }));
  const selectedWorker = workerId ? workers.find((worker) => worker.id === workerId) : null;
  const siteSummary = selectedWorker ? summarizeSites(shifts) : [];
  const invoiceRows = summarizeClientInvoice(shifts);
  const clientTotal = invoiceRows.reduce((sum, row) => sum + row.amount, 0);
  const missingClientPrices = shifts.filter((shift) => shift.client_pricing_rate == null).length;
  const totals = rows.reduce((sum, row) => ({ hours: sum.hours + row.hours, days: sum.days + row.days, gross: sum.gross + row.gross, net: sum.net + row.net }), { hours: 0, days: 0, gross: 0, net: 0 });
  const currency = selectedWorker?.currency ?? rows[0]?.currency ?? "EUR";
  const baseQuery = `from=${range.from}&to=${range.to}&preset=custom${siteId ? `&site=${siteId}` : ""}`;

  return <div className="page-stack">
    <PageHeader eyebrow="Aruandlus" title="Aruanne" description={`${formatDate(range.from)} – ${formatDate(range.to)}`} actions={<ExportButtons from={range.from} to={range.to} workerId={workerId || undefined} siteId={siteId || undefined} />} />
    <form className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] lg:items-end">
      <label><span className="field-label">Periood</span><select name="preset" defaultValue={preset} className="control bg-bg"><option value="current">Käesolev kuu</option><option value="previous">Eelmine kuu</option><option value="custom">Kohandatud periood</option></select></label>
      <label><span className="field-label">Töötaja</span><select name="worker" defaultValue={workerId} className="control bg-bg"><option value="">Kõik töötajad</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.first_name} {worker.last_name}</option>)}</select></label>
      <label><span className="field-label">Objekt</span><select name="site" defaultValue={siteId} className="control bg-bg"><option value="">Kõik objektid</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}{site.address ? ` · ${site.address}` : ""}</option>)}</select></label>
      <button className="btn-primary">Näita</button>
      <label><span className="field-label">Alates</span><input type="date" name="from" defaultValue={range.from} className="control bg-bg" /></label>
      <label><span className="field-label">Kuni</span><input type="date" name="to" defaultValue={range.to} className="control bg-bg" /></label>
    </form>
    <MetricStrip items={[
      { label: "Kokku töötunde", value: `${hours1(totals.hours * 3600)} h`, detail: `${totals.days} tööpäeva` },
      { label: "Töötaja arvestus", value: money(totals.gross + totals.net, currency), detail: "Salvestatud töötaja hinnad" },
      { label: "Kliendi arvestus", value: money(clientTotal, currency), detail: missingClientPrices ? `${missingClientPrices} real hind puudu` : "Kõik hinnad olemas", tone: missingClientPrices ? undefined : "signal" },
      { label: workerId ? "Tööpäevi" : "Töötajaid", value: workerId ? totals.days : rows.filter((row) => row.hours || row.gross || row.net).length, detail: workerId && selectedWorker ? `${selectedWorker.first_name} ${selectedWorker.last_name}` : `${rows.length} aruandes` },
    ]} />
    {!selectedWorker ? <GeneralReport rows={rows} baseQuery={baseQuery} /> : <PersonalReport worker={selectedWorker} shifts={shifts} adjustments={adjustments ?? []} siteSummary={siteSummary} currency={currency} />}
    <ClientInvoiceSection rows={invoiceRows} missing={missingClientPrices} currency={currency} />
    <p className="text-xs text-muted">Bruto ja neto kuvatakse ainult siis, kui vastav liik on andmetes salvestatud. WorkTime ei arvuta makse ega teisenda bruto- ja netosummasid omavahel.</p>
  </div>;
}

type SummaryRow = ReturnType<typeof summarizeWorkers>[number];
function GeneralReport({ rows, baseQuery }: { rows: SummaryRow[]; baseQuery: string }) {
  if (!rows.length) return <EmptyState title="Aruandes pole töötajaid" description="Valitud filtritega ei leitud töötajaid." />;
  return <section className="space-y-2"><h2 className="section-title">Töötajate aruanne</h2><div className="space-y-2 sm:hidden">{rows.map((row) => <div key={row.id} className="panel p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{row.name}</div><div className="text-xs text-muted">{row.workTypes.join(" · ") || "Tööd puuduvad"}</div></div><div className="text-right"><div className="tabular font-semibold">{row.hours.toFixed(2)} h</div><div className="text-xs text-muted">{row.days} päeva · {row.sites} objekti</div></div></div><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm"><span>{row.quantities.join(" · ") || "Kogus —"}</span>{row.hasGross && <span>Bruto {money(row.gross, row.currency)}</span>}{row.hasNet && <span className="font-semibold text-signal">Neto {money(row.net, row.currency)}</span>}</div><Link href={`/reports?${baseQuery}&worker=${row.id}`} className="btn-secondary mt-3 w-full">Ava aruanne</Link></div>)}</div><div className="panel hidden overflow-x-auto sm:block"><table className="data-table"><thead><tr><th className="px-3 py-2 text-left">Töötaja</th><th className="px-3 py-2 text-right">Päevi</th><th className="px-3 py-2 text-right">Tunnid</th><th className="px-3 py-2 text-left">Töö kogus</th><th className="px-3 py-2 text-right">Objektid</th><th className="px-3 py-2 text-right">Bruto</th><th className="px-3 py-2 text-right">Neto</th><th className="px-3 py-2" /></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="px-3 py-3 font-medium">{row.name}<div className="text-xs font-normal text-muted">{row.workTypes.join(" · ") || "Tööd puuduvad"}</div></td><td className="px-3 py-3 text-right tabular">{row.days}</td><td className="px-3 py-3 text-right tabular">{row.hours.toFixed(2)}</td><td className="px-3 py-3 text-sm">{row.quantities.join(" · ") || "—"}</td><td className="px-3 py-3 text-right tabular">{row.sites}</td><td className="px-3 py-3 text-right tabular">{row.hasGross ? money(row.gross, row.currency) : "—"}</td><td className="px-3 py-3 text-right tabular font-semibold text-signal">{row.hasNet ? money(row.net, row.currency) : "—"}</td><td className="px-3 py-3 text-right"><Link href={`/reports?${baseQuery}&worker=${row.id}`} className="btn-quiet whitespace-nowrap">Ava aruanne</Link></td></tr>)}</tbody></table></div></section>;
}

function PersonalReport({ worker, shifts, adjustments, siteSummary, currency }: { worker: { id: string; first_name: string; last_name: string }; shifts: ReportShift[]; adjustments: Array<{ id: string; site_id: string | null; period_month: string; amount: number; currency: string; is_net: boolean; note: string }>; siteSummary: ReturnType<typeof summarizeSites>; currency: string }) {
  const siteMap = new Map(siteSummary.map((site) => [site.id, site]));
  return <div className="space-y-6"><section className="space-y-2"><h2 className="section-title">{worker.first_name} {worker.last_name}</h2><div className="panel overflow-x-auto"><table className="data-table"><thead><tr><th className="px-3 py-2 text-left">Kuupäev</th><th className="px-3 py-2 text-left">Objekt</th><th className="px-3 py-2 text-left">Töö liik</th><th className="px-3 py-2 text-right">Kogus</th><th className="px-3 py-2 text-right">Töötaja hind</th><th className="px-3 py-2 text-right">Töötaja summa</th><th className="px-3 py-2 text-right">Kliendi hind</th><th className="px-3 py-2 text-right">Kliendi summa</th></tr></thead><tbody>{shifts.map((shift) => { const clientTotal = clientShiftTotal(shift); return <tr key={shift.id} className="border-b border-border last:border-0"><td className="whitespace-nowrap px-3 py-3">{formatDate(shift.work_date)}</td><td className="px-3 py-3"><div className="font-medium">{shift.site_name ?? "Objekt määramata"}</div>{shift.site_address && <div className="text-xs text-muted">{shift.site_address}</div>}</td><td className="px-3 py-3">{shift.pricing_label ?? PRICING_LABELS[shift.pricing_type]}</td><td className="px-3 py-3 text-right tabular">{shift.pricing_type === "hourly" ? `${((shift.worked_seconds ?? 0) / 3600).toFixed(2)} h` : shift.quantity != null ? `${formatQuantity(shift.quantity)} ${shift.unit ?? pricingUnit(shift.pricing_type)}` : "—"}</td><td className="px-3 py-3 text-right tabular">{shift.pricing_rate != null ? `${Number(shift.pricing_rate).toFixed(2)} €/${pricingUnit(shift.pricing_type, shift.unit)}` : "—"}</td><td className="px-3 py-3 text-right tabular font-semibold">{money(shiftTotal(shift), currency)} {shift.is_net === false ? "bruto" : "neto"}</td><td className="px-3 py-3 text-right tabular">{shift.client_pricing_rate != null ? `${Number(shift.client_pricing_rate).toFixed(2)} €/${pricingUnit(shift.pricing_type, shift.unit)}` : <span className="text-alert">Puudub</span>}</td><td className="px-3 py-3 text-right tabular font-semibold">{clientTotal == null ? "—" : money(clientTotal, currency)}</td></tr>; })}{adjustments.map((item) => { const site = item.site_id ? siteMap.get(item.site_id) : null; return <tr key={item.id} className="border-b border-border last:border-0"><td className="px-3 py-3">{item.period_month.slice(0, 7)}</td><td className="px-3 py-3">{site?.name ?? "—"}</td><td className="px-3 py-3">Kuu lisasumma · {item.note}</td><td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right tabular font-semibold">{money(item.amount, item.currency)} {item.is_net === false ? "bruto" : "neto"}</td><td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right">—</td></tr>; })}</tbody></table>{!shifts.length && !adjustments.length && <p className="p-4 text-sm text-muted">Valitud perioodil pole töö- ega tasuridu.</p>}</div></section><section className="space-y-2"><h2 className="section-title">Objektide kokkuvõte</h2><div className="grid gap-3 md:grid-cols-2">{siteSummary.map((site) => <div key={site.id} className="panel p-4"><div className="font-medium">{site.name}</div>{site.address && <div className="text-sm text-muted">{site.address}</div>}<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm"><span><b className="tabular">{site.hours.toFixed(2)}</b> h</span>{site.quantityLabels.map((label) => <span key={label}><b>{label}</b></span>)}<span>Töötaja <b>{money(site.amount, currency)}</b></span><span className="ml-auto font-semibold text-signal">Klient {money(site.clientAmount, currency)}</span></div>{site.missingClientPrices > 0 && <p className="mt-2 text-xs text-alert">{site.missingClientPrices} real puudub kliendihind.</p>}</div>)}{!siteSummary.length && <EmptyState title="Objektide andmed puuduvad" description="Valitud perioodil ei ole objekti külge seotud vahetusi." />}</div></section></div>;
}

function ClientInvoiceSection({ rows, missing, currency }: { rows: ReturnType<typeof summarizeClientInvoice>; missing: number; currency: string }) {
  return <section className="space-y-2"><div><h2 className="section-title">Kliendi arve alus</h2><p className="mt-1 text-sm text-muted">Sama tehtud töö on koondatud objekti, töö liigi, ühiku ja salvestatud kliendihinna järgi.</p></div>{missing > 0 && <div className="rounded-lg border border-alert/30 bg-alert/5 px-4 py-3 text-sm text-alert">{missing} tööreal puudub kliendihind. Neid ridu ei lisata kliendi summasse enne hinna määramist.</div>}<div className="panel overflow-x-auto"><table className="data-table"><thead><tr><th className="px-3 py-2 text-left">Klient / objekt</th><th className="px-3 py-2 text-left">Töö</th><th className="px-3 py-2 text-right">Kogus</th><th className="px-3 py-2 text-right">Kliendi hind</th><th className="px-3 py-2 text-right">Summa</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.siteId}-${row.label}-${row.unit}-${row.rate}`} className="border-b border-border last:border-0"><td className="px-3 py-3"><div className="font-medium">{row.clientName ?? "Klient määramata"}</div><div className="text-sm">{row.siteName}</div>{row.siteAddress && <div className="text-xs text-muted">{row.siteAddress}</div>}</td><td className="px-3 py-3">{row.label}</td><td className="px-3 py-3 text-right tabular">{formatQuantity(row.quantity)} {row.unit}</td><td className="px-3 py-3 text-right tabular">{money(row.rate, currency)}/{row.unit}</td><td className="px-3 py-3 text-right tabular font-semibold">{money(row.amount, currency)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4} className="px-3 py-3 text-right font-medium">Kokku</td><td className="px-3 py-3 text-right tabular font-semibold text-signal">{money(rows.reduce((sum, row) => sum + row.amount, 0), currency)}</td></tr></tfoot></table>{!rows.length && <p className="p-4 text-sm text-muted">Valitud töödel pole veel kliendihindu.</p>}</div></section>;
}

function monthRange(date: Date) { const year = date.getUTCFullYear(); const month = date.getUTCMonth(); return { from: ymd(new Date(Date.UTC(year, month, 1))), to: ymd(new Date(Date.UTC(year, month + 1, 0))) }; }
function validDate(value?: string): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; }
