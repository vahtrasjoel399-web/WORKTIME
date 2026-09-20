"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { employeeFileError, employeeStoragePath } from "@/lib/employee-files";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { EmployeeDocument, Profile } from "@/lib/types";
import { useToast } from "./ToastProvider";

type DocumentWithUrl = EmployeeDocument & { signed_url: string | null };

function fileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function EmployeeDocuments({
  worker,
  actorId,
  documents,
}: {
  worker: Profile;
  actorId: string;
  documents: DocumentWithUrl[];
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = supabaseBrowser();
  const [uploading, setUploading] = useState<"cv" | "other" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const cvExists = documents.some((document) => document.document_type === "cv");

  async function upload(file: File | undefined, documentType: "cv" | "other") {
    if (!file) return;
    const validationError = employeeFileError(file, "documents");
    if (validationError) return toast(validationError, "error");

    setUploading(documentType);
    const path = employeeStoragePath(worker.company_id, worker.id, "documents", file);
    const { error: uploadError } = await supabase.storage
      .from("employee-files")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setUploading(null);
      return toast("Faili üleslaadimine ebaõnnestus.", "error");
    }

    const { error: metadataError } = await supabase.from("employee_documents").insert({
      company_id: worker.company_id,
      employee_id: worker.id,
      filename: file.name.slice(0, 255),
      storage_path: path,
      document_type: documentType,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: actorId,
    });
    if (metadataError) {
      await supabase.storage.from("employee-files").remove([path]);
      setUploading(null);
      return toast("Dokumendi andmete salvestamine ebaõnnestus.", "error");
    }

    setUploading(null);
    toast(documentType === "cv" ? (cvExists ? "CV uus versioon lisati." : "CV lisati.") : "Dokument lisati.");
    router.refresh();
  }

  async function deleteDocument(documentId: string) {
    setDeleting(documentId);
    const response = await fetch(`/api/workers/${worker.id}/documents/${documentId}`, {
      method: "DELETE",
    });
    setDeleting(null);
    if (!response.ok) return toast("Dokumendi kustutamine ebaõnnestus.", "error");
    setConfirmingDelete(null);
    toast("Dokument kustutati jäädavalt.");
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h3 className="font-display text-lg font-semibold">Dokumendid</h3>
        <p className="mt-1 text-xs text-muted">Privaatsed failid · ligipääs ainult ettevõtte administraatoril</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="cursor-pointer rounded-lg bg-text px-3 py-2 text-center text-sm font-semibold text-bg">
          {uploading === "cv" ? "Laadin…" : cvExists ? "Asenda CV" : "Lisa CV"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            disabled={uploading !== null}
            onChange={(event) => {
              void upload(event.target.files?.[0], "cv");
              event.currentTarget.value = "";
            }}
          />
        </label>
        <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-center text-sm font-medium hover:border-signal">
          {uploading === "other" ? "Laadin…" : "Lisa dokument"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            disabled={uploading !== null}
            onChange={(event) => {
              void upload(event.target.files?.[0], "other");
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted">PDF, Word, JPG, PNG või WebP · kuni 10 MB. CV asendamisel säilib eelmine versioon.</p>

      <div className="space-y-2">
        {documents.length === 0 && <p className="rounded-lg bg-bg p-3 text-sm text-muted">Dokumente pole lisatud.</p>}
        {documents.map((document, index) => (
          <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${document.document_type === "cv" ? "bg-signal/10 text-signal" : "bg-bg text-muted"}`}>
                  {document.document_type === "cv" ? index === documents.findIndex((item) => item.document_type === "cv") ? "CV · uusim" : "CV" : "Fail"}
                </span>
                <span className="truncate text-sm font-medium">{document.filename}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {new Date(document.created_at).toLocaleDateString("et-EE")}
                {document.size_bytes != null && ` · ${fileSize(document.size_bytes)}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {document.signed_url ? (
                <a href={document.signed_url} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:border-signal">
                  Ava
                </a>
              ) : (
                <span className="text-xs text-alert">Pole saadaval</span>
              )}
              {confirmingDelete === document.id ? (
                <>
                  <button onClick={() => setConfirmingDelete(null)} disabled={deleting !== null} className="rounded-lg border border-border px-2 py-2 text-xs">Tühista</button>
                  <button onClick={() => void deleteDocument(document.id)} disabled={deleting !== null} className="rounded-lg border border-alert px-2 py-2 text-xs text-alert disabled:opacity-60">
                    {deleting === document.id ? "…" : "Kinnita"}
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmingDelete(document.id)} disabled={deleting !== null} className="rounded-lg px-2 py-2 text-xs text-alert disabled:opacity-60">Kustuta</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
