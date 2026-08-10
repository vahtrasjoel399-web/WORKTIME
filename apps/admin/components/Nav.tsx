"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toggleTheme } from "./ThemeInit";
import { supabaseBrowser } from "@/lib/supabase-browser";

const links = [
  { href: "/", label: "Töötajad" },
  { href: "/map", label: "Elav kaart" },
  { href: "/reports", label: "Aruanded" },
  { href: "/sites", label: "Objektid" },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  // no admin nav on the login or worker screens
  if (path.startsWith("/login") || path.startsWith("/me")) return null;

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-4 sm:px-5">
        <Link href="/" className="shrink-0 font-display text-lg font-bold tracking-tight">
          Tööaeg
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                  active ? "bg-bg text-text" : "text-muted hover:text-text"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={toggleTheme}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted hover:text-text"
          aria-label="Vaheta teemat"
        >
          ◐
        </button>
        <button onClick={signOut} className="shrink-0 whitespace-nowrap text-sm text-muted hover:text-alert">
          Välja
        </button>
      </div>
    </header>
  );
}
