"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DeleteWorker } from "./DeleteWorker";
import { Icon } from "./Icon";
import { distanceLabel, matchSite, shortAddress } from "@/lib/geo";
import { hours1, money } from "@/lib/format";
import type { Profile, Site } from "@/lib/types";
import { pricingUnit, PRICING_LABELS } from "@/lib/pricing";
import { EmptyState, StatusBadge } from "./ui";
import { useI18n } from "./I18nProvider";

type OpenShift = {
  user_id: string;
  site_id: string | null;
  started_at: string;
  start_lat: number | null;
  start_lng: number | null;
  start_address: string | null;
};

type Assignment = {
  employee_id: string;
  site_id: string;
  start_date: string;
};

type StatusFilter = "all" | "active" | "inactive";

interface Props {
  workers: Profile[];
  sites: Site[];
  openShifts: OpenShift[];
  assignments: Assignment[];
  weekSeconds: Record<string, number>;
  weekEarned: Record<string, number>;
  photoUrls: Record<string, string>;
  readOnly?: boolean;
}

function EmployeeAvatar({ worker, url, size = "md" }: { worker: Profile; url?: string; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const initials = `${worker.first_name.charAt(0)}${worker.last_name.charAt(0)}`.toUpperCase() || "?";
  const classes = size === "lg" ? "h-12 w-12 text-sm" : "h-10 w-10 text-xs";

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={`${worker.first_name} ${worker.last_name}`}
        className={`${classes} shrink-0 rounded-full border border-border object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`${classes} flex shrink-0 items-center justify-center rounded-full border border-border bg-bg font-display font-bold text-muted`}>
      {initials}
    </span>
  );
}

export function EmployeeDirectory({ workers, sites, openShifts, assignments, weekSeconds, weekEarned, photoUrls, readOnly = false }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const siteById = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const openBy = useMemo(() => new Map(openShifts.map((shift) => [shift.user_id, shift])), [openShifts]);
  const assignmentByEmployee = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.employee_id, assignment])),
    [assignments],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return workers.filter((worker) => {
      if (status === "active" && !worker.is_active) return false;
      if (status === "inactive" && worker.is_active) return false;

      const assignedSiteId = assignmentByEmployee.get(worker.id)?.site_id ?? worker.default_site_id;
      const assignedSite = assignedSiteId ? siteById.get(assignedSiteId) : null;
      const haystack = [
        worker.first_name,
        worker.last_name,
        worker.email,
        worker.phone,
        worker.position,
        assignedSite?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [assignmentByEmployee, query, siteById, status, workers]);

  return (
    <div className="space-y-4">
      <div className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <label className="relative flex-1">
          <span className="sr-only">{t("searchEmployee")}</span>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"><Icon name="search" className="h-4 w-4" /></span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchEmployeeHint")}
            className="control bg-bg pl-9"
          />
        </label>
        <label className="flex items-center gap-2 sm:w-52">
          <span className="shrink-0 text-sm text-muted">{t("status")}</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="control bg-bg"
          >
            <option value="all">{t("all")}</option>
            <option value="active">{t("activePlural")}</option>
            <option value="inactive">{t("inactivePlural")}</option>
          </select>
        </label>
        <div className="text-right text-xs text-muted sm:w-24">
          {filtered.length} / {workers.length}
        </div>
      </div>

      {filtered.length === 0 && (
        <EmptyState title="Töötajaid ei leitud" description="Muuda otsingut või staatuse filtrit." />
      )}

      <div className="space-y-3 sm:hidden">
        {filtered.map((worker, index) => {
          const open = openBy.get(worker.id);
          const assignment = assignmentByEmployee.get(worker.id);
          const assignedSiteId = assignment?.site_id ?? worker.default_site_id;
          const assignedSite = assignedSiteId ? siteById.get(assignedSiteId) : null;
          const seconds = weekSeconds[worker.id] ?? 0;
          const rate = worker.pricing_type === "hourly" ? worker.hourly_rate ?? worker.self_hourly_rate ?? null : worker.hourly_rate;
          return (
            <Link
              key={worker.id}
              href={readOnly ? "/" : `/workers/${worker.id}`}
              aria-disabled={readOnly || undefined}
              onClick={readOnly ? (event) => event.preventDefault() : undefined}
              className={`rise panel block p-4 ${readOnly ? "cursor-default" : "transition-colors hover:border-border-strong hover:bg-elevated"}`}
              style={{ animationDelay: `${index * 35}ms` }}
            >
              <div className="flex items-start gap-3">
                <EmployeeAvatar worker={worker} url={photoUrls[worker.id]} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-lg font-semibold">
                    {worker.first_name} {worker.last_name}
                  </div>
                  <div className="truncate text-sm text-muted">{worker.position || "Amet määramata"}</div>
                </div>
                {!readOnly && <Icon name="arrow" className="mt-1 h-5 w-5 shrink-0 text-muted" />}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <StatusBadge tone={worker.is_active ? "live" : "neutral"}>{worker.is_active ? "Aktiivne" : "Mitteaktiivne"}</StatusBadge>
                {open && <StatusBadge tone="primary"><span className="h-1.5 w-1.5 rounded-full bg-current" />Vahetuses</StatusBadge>}
              </div>

              <div className="mt-3 grid gap-2 rounded-xl bg-bg p-3 text-sm">
                <div><span className="text-muted">Objekt: </span><span className="font-medium">{assignedSite?.name ?? "Määramata"}</span></div>
                {worker.phone && <div className="break-words"><span className="text-muted">Tel: </span>{worker.phone}</div>}
                {worker.email && <div className="break-all"><span className="text-muted">E-post: </span>{worker.email}</div>}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div><div className="text-xs text-muted">Tunnid sel nädalal</div><div className="tabular mt-0.5 font-semibold">{hours1(seconds)} h</div></div>
                <div className="text-right"><div className="text-xs text-muted">Teenitud</div><div className="tabular mt-0.5 font-semibold text-signal">{rate != null ? money(weekEarned[worker.id] ?? 0, worker.currency) : "—"}</div></div>
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length > 0 && (
        <div className="panel hidden overflow-x-auto sm:block">
          <table className="data-table">
            <thead>
              <tr>
                <th className="px-4 py-3 font-medium">{t("employee")}</th>
                <th className="px-4 py-3 font-medium">{t("contact")}</th>
                <th className="px-4 py-3 font-medium">{t("currentSite")}</th>
                <th className="px-4 py-3 font-medium">{t("status")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("week")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("rate")}</th>
                {!readOnly && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((worker, index) => {
                const open = openBy.get(worker.id);
                const fix = open && !readOnly ? matchSite(open.start_lat, open.start_lng, sites) : null;
                const detectedSite = open?.site_id ? siteById.get(open.site_id) ?? null : fix?.site ?? null;
                const assignment = assignmentByEmployee.get(worker.id);
                const assignedSiteId = assignment?.site_id ?? worker.default_site_id;
                const assignedSite = assignedSiteId ? siteById.get(assignedSiteId) : null;
                const address = shortAddress(open?.start_address ?? null);
                const outOfZone = open != null && detectedSite == null && fix?.nearest != null;
                const seconds = weekSeconds[worker.id] ?? 0;
                const rate = worker.pricing_type === "hourly" ? worker.hourly_rate ?? worker.self_hourly_rate ?? null : worker.hourly_rate;
                return (
                  <tr key={worker.id} className="rise" style={{ animationDelay: `${index * 25}ms` }}>
                    <td className="px-4 py-3">
                      <Link href={readOnly ? "/" : `/workers/${worker.id}`} aria-disabled={readOnly || undefined} onClick={readOnly ? (event) => event.preventDefault() : undefined} className={`flex min-w-48 items-center gap-3 ${readOnly ? "cursor-default" : "hover:text-signal"}`}>
                        <EmployeeAvatar worker={worker} url={photoUrls[worker.id]} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{worker.first_name} {worker.last_name}</span>
                          <span className="block truncate text-xs text-muted">{worker.position || "Amet määramata"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-56 truncate">{worker.phone || "—"}</div>
                      <div className="max-w-56 truncate text-xs text-muted">{worker.email || "E-post puudub"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{assignedSite?.name ?? "Määramata"}</div>
                      {open && !readOnly && (
                        <div className={`max-w-64 text-xs ${outOfZone ? "text-alert" : "text-muted"}`}>
                          {detectedSite?.name && detectedSite.id !== assignedSite?.id ? `Vahetus: ${detectedSite.name}` : address}
                          {outOfZone && fix?.nearest && ` · ${distanceLabel(fix.distance)} objektist ${fix.nearest.name}`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={worker.is_active ? "live" : "neutral"}>{worker.is_active ? "Aktiivne" : "Mitteaktiivne"}</StatusBadge>
                      <div className={`mt-1.5 flex items-center gap-1.5 text-xs ${open ? "text-primary" : "text-muted"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{open ? "Vahetuses" : "Vaba"}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="tabular font-semibold">{hours1(seconds)} h</div>
                      <div className="tabular text-xs text-signal">{rate != null ? money(weekEarned[worker.id] ?? 0, worker.currency) : "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      <div>{worker.hourly_rate != null ? `${money(worker.hourly_rate, worker.currency)}/${pricingUnit(worker.pricing_type ?? "hourly", worker.pricing_unit)}` : "—"}</div>
                      <div className="text-[10px]">{PRICING_LABELS[worker.pricing_type ?? "hourly"]}</div>
                    </td>
                    {!readOnly && <td className="px-4 py-3 text-right">
                      <DeleteWorker id={worker.id} name={`${worker.first_name} ${worker.last_name}`} />
                    </td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
