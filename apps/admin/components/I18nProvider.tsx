"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { dict, LANGS, type Lang } from "@/lib/dict";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}
const I18nContext = createContext<Ctx | null>(null);

function detect(): Lang {
  if (typeof navigator === "undefined") return "et";
  const code = (navigator.language || "et").slice(0, 2).toLowerCase();
  return (LANGS as string[]).includes(code) ? (code as Lang) : "et";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("et");

  useEffect(() => {
    const saved = (localStorage.getItem("web-lang") as Lang | null) ?? detect();
    setLangState(saved);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("web-lang", l);
  }, []);

  const t = useCallback((key: string) => dict[key]?.[lang] ?? key, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error("useI18n must be used within I18nProvider");
  return c;
}

// Compact ET / RU / EN switcher for the auth + worker screens.
export function LangSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex justify-center gap-2">
      {LANGS.map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            l === lang ? "border-signal bg-signal/20 text-signal" : "border-border text-muted"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
