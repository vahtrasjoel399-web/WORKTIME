import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Theme, ThemeName, themes } from "./tokens";

type ThemePref = "light" | "dark" | "system";
const KEY = "theme-pref";

interface Ctx {
  theme: Theme;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); // 'light' | 'dark' | null
  const [pref, setPrefState] = useState<ThemePref>("system");

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setPrefState(v);
    });
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p);
  };

  const resolved: ThemeName = pref === "system" ? (system === "dark" ? "dark" : "light") : pref;
  const value = useMemo<Ctx>(
    () => ({ theme: themes[resolved], pref, setPref }),
    [resolved, pref],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
