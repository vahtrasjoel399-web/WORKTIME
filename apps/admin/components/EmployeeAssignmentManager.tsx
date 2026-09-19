"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { EmployeeAssignment, Site } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

export function EmployeeAssignmentManager({
  employeeId,
  currentAssignment,
  sites,
}: {
  employeeId: string;
  currentAssignment: EmployeeAssignment | null;
  sites: Site[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [siteId, setSiteId] = useState(currentAssignment?.site_id ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const selectableSites = sites.filter((site) => site.status === "active" || site.id === currentAssignment?.site_id);
  const selectionChanged = siteId !== (currentAssignment?.site_id ?? "");

  async function updateAssignment(nextSiteId: string | null) {
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("set_employee_assignment", {
      p_employee_id: employeeId,
      p_site_id: nextSiteId,
    });
    setBusy(false);
    setConfirmRemove(false);
    if (error) return toast(error.message || "Objekti määramine ebaõnnestus.", "error");
    setSiteId(nextSiteId ?? "");
    toast(nextSiteId ? (currentAssignment ? "Töötaja viidi uuele objektile." : "Töötaja määrati objektile.") : "Töötaja eemaldati objektilt.");
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <label className="block">
        <span className="text-xs text-muted">Muuda praegust objekti</span>
        <select
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-signal disabled:opacity-60"
        >
          <option value="">— vali aktiivne objekt —</option>
          {selectableSites.map((site) => (
            <option key={site.id} value={site.id}>{site.name}{site.status === "inactive" ? " (mitteaktiivne)" : ""}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void updateAssignment(siteId)}
          disabled={busy || !siteId || !selectionChanged}
          className="flex-1 rounded-lg bg-text px-3 py-2 text-sm font-semibold text-bg disabled:opacity-50"
        >
          {busy ? "Salvestan…" : currentAssignment ? "Teisalda töötaja" : "Määra objekt"}
        </button>
        {currentAssignment && (
          <button
            onClick={() => setConfirmRemove(true)}
            disabled={busy}
            className="rounded-lg border border-alert px-3 py-2 text-sm text-alert hover:bg-alert/10 disabled:opacity-50"
          >
            Eemalda objektilt
          </button>
        )}
      </div>
      <p className="text-xs text-muted">Teisaldamisel suletakse eelmine määramine ja ajalugu säilib.</p>
      <ConfirmDialog
        open={confirmRemove}
        title="Eemalda töötaja objektilt?"
        body="Praegune määramine suletakse tänase kuupäevaga. Töötaja jääb ettevõttesse aktiivseks."
        confirmLabel="Eemalda objektilt"
        busy={busy}
        onConfirm={() => void updateAssignment(null)}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
