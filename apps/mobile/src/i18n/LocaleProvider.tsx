import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { i18n, initLocale, setLocale as persistLocale, type Locale } from "./index";

interface Ctx {
  locale: Locale;
  change: (l: Locale) => Promise<void>;
}

const LocaleContext = createContext<Ctx | null>(null);

// Holds the active locale in state so any language change re-renders the whole
// tree — used by the switcher on the auth screens and in Settings.
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>((i18n.locale as Locale) || "et");

  useEffect(() => {
    initLocale().then((l) => setLocaleState(l));
  }, []);

  const change = useCallback(async (l: Locale) => {
    await persistLocale(l);
    setLocaleState(l);
  }, []);

  return <LocaleContext.Provider value={{ locale, change }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Ctx {
  const c = useContext(LocaleContext);
  if (!c) throw new Error("useLocale must be used within LocaleProvider");
  return c;
}
