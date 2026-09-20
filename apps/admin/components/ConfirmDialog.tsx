"use client";

export function ConfirmDialog({ open, title, body, confirmLabel, busy, onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onKeyDown={(e) => { if (e.key === "Escape" && !busy) onCancel(); }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
    <div className="dialog-in w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-alert/10 text-lg font-bold text-alert">!</div>
      <h2 id="confirm-title" className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={onCancel} className="btn-secondary">Tühista</button>
        <button disabled={busy} onClick={onConfirm} className="btn bg-alert text-white hover:bg-alert/90">{busy ? "Palun oota…" : confirmLabel}</button>
      </div>
    </div>
  </div>;
}
