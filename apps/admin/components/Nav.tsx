"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toggleTheme } from "./ThemeInit";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Icon, type IconName } from "./Icon";

const links: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/", label: "Töötajad", short: "Tiim", icon: "users" },
  { href: "/map", label: "Elav kaart", short: "Kaart", icon: "map" },
  { href: "/reports", label: "Aruanded", short: "Aruanne", icon: "report" },
  { href: "/sites", label: "Objektid", short: "Objektid", icon: "site" },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  // no admin nav on the login or worker screens
  if (path.startsWith("/login") || path.startsWith("/me") || path.startsWith("/set-password") || path.startsWith("/privacy")) return null;

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5 rounded-lg font-display font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-colors group-hover:bg-primary-hover">W</span>
          <span>Tööaeg</span>
        </Link>
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <nav className="hidden flex-1 items-center gap-1 overflow-x-auto no-scrollbar sm:flex" aria-label="Põhinavigatsioon">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-muted hover:bg-bg hover:text-text"
                }`}
              >
                <span className="flex items-center gap-2"><Icon name={l.icon} className="h-4 w-4" />{l.label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          onClick={toggleTheme}
          className="btn-quiet h-10 w-10 shrink-0 px-0"
          aria-label="Vaheta teemat"
        >
          <Icon name="moon" className="h-4 w-4" />
        </button>
        <button onClick={signOut} className="btn-quiet ml-auto shrink-0 whitespace-nowrap hover:text-alert sm:ml-0">
          <span className="hidden sm:inline">Välja</span><Icon name="logout" className="h-5 w-5 sm:hidden" />
        </button>
      </div>
    </header>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Põhinavigatsioon">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return <Link key={l.href} href={l.href} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-center text-[11px] font-medium transition-colors ${active ? "text-primary" : "text-muted"}`} aria-current={active ? "page" : undefined}>{active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}<Icon name={l.icon} className="h-5 w-5" />{l.short}</Link>;
      })}
    </nav>
    </>
  );
}
