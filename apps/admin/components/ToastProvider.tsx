"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastKind = "success" | "error";
type Toast = { id: number; message: string; kind: ToastKind };
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const show = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now();
    setItems((old) => [...old, { id, message, kind }]);
    window.setTimeout(() => setItems((old) => old.filter((item) => item.id !== id)), 3600);
  }, []);
  const value = useMemo(() => show, [show]);
  return <ToastContext.Provider value={value}>
    {children}
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-center gap-2 sm:left-auto sm:right-5 sm:top-5 sm:w-80">
      {items.map((item) => <div key={item.id} role="status" className={`toast-in w-full rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur ${item.kind === "success" ? "border-live/30 bg-surface/95 text-live" : "border-alert/30 bg-surface/95 text-alert"}`}>{item.message}</div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() { return useContext(ToastContext); }
