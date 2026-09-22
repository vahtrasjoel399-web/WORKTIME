"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({ open, title, body, confirmLabel, busy, onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" onKeyDown={(e) => { if (e.key === "Escape" && !busy) onCancel(); }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
    <div className="dialog-in max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-alert/10 text-lg font-bold text-alert" aria-hidden="true">!</div>
        <div className="min-w-0 pt-0.5">
          <h2 id="confirm-title" className="font-display text-lg font-semibold sm:text-xl">{title}</h2>
          <p id="confirm-description" className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button ref={cancelRef} disabled={busy} onClick={onCancel} className="btn-secondary sm:min-w-28">Tühista</button>
        <button disabled={busy} onClick={onConfirm} className="btn bg-alert text-white hover:bg-alert/90 sm:min-w-28">{busy ? "Palun oota…" : confirmLabel}</button>
      </div>
    </div>
  </div>;
}
