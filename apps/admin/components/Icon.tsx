import type { SVGProps } from "react";

export type IconName = "users" | "map" | "report" | "site" | "moon" | "logout" | "arrow" | "plus" | "clock" | "empty";

const paths: Record<IconName, React.ReactNode> = {
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
  report: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  site: <><path d="M3 21h18M5 21V7l8-4v18M13 9h6v12M8 9h1M8 13h1M8 17h1M16 13h1M16 17h1"/></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  empty: <><path d="M4 7h16v12H4zM8 3h8v4M8 12h8M8 16h5"/></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
