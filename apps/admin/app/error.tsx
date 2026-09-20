"use client";

import { Icon } from "@/components/Icon";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center">
      <div className="panel w-full p-6 text-center sm:p-8">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-alert/10 text-alert"><Icon name="warning" className="h-5 w-5" /></span>
        <h1 className="mt-4 font-display text-xl font-semibold">Sisu laadimine ebaõnnestus</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Kontrolli ühendust ja proovi uuesti. Sinu andmeid ei muudetud.</p>
        <button onClick={reset} className="btn-primary mt-5">Proovi uuesti</button>
      </div>
    </div>
  );
}
