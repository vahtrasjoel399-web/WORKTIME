"use client";
import { useEffect } from "react";

// Applies saved/system theme by toggling the .dark class on <html>. Runs before
// paint via a blocking inline script to avoid a flash, then keeps it in sync.
export function ThemeInit() {
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = saved ? saved === "dark" : sys;
    document.documentElement.classList.toggle("dark", dark);
  }, []);
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
      }}
    />
  );
}

export function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
  window.dispatchEvent(new Event("themechange"));
}
