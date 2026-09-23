"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    let response: Response;
    try {
      response = await fetch(`/api/workers/${employeeId}/assignment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site_id: nextSiteId }) });
    } catch {
      setBusy(false);
      return toast("Serveriga ei saadud ühendust.", "error");
    }
    setBusy(false);
    setConfirmRemove(false);
    if (!response.ok) return toast((await response.text()) || "Objekti määramine ebaõnnestus.", "error");
    const result = await response.json() as { notification?: string; message?: string };
    setSiteId(nextSiteId ?? "");
    toast(nextSiteId ? `${currentAssignment ? "Töötaja viidi uuele objektile." : "Töötaja määrati objektile."}${result.notification === "sent" ? " Teavitus saadeti e-postile." : result.notification === "failed" ? " E-posti teavitus ebaõnnestus." : ""}` : "Töötaja eemaldati objektilt.", result.notification === "failed" ? "error" : "success");
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
          className="control mt-1 bg-bg"
        >
          <option value="">— vali aktiivne objekt —</option>
          {selectableSites.map((site) => (
            <option key={site.id} value={site.id}>{site.name}{site.status === "inactive" ? " (mitteaktiivne)" : ""}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        <button
          onClick={() => void updateAssignment(siteId)}
          disabled={busy || !siteId || !selectionChanged}
          className="btn-primary w-full"
        >
          {busy ? "Salvestan…" : currentAssignment ? "Teisalda töötaja" : "Määra objekt"}
        </button>
        {currentAssignment && (
          <button
            onClick={() => setConfirmRemove(true)}
            disabled={busy}
            className="btn-danger w-full"
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
