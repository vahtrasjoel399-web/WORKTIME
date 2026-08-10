// Design tokens as (light, dark) pairs — never hardcode a hex in a component. (DECISIONS D-004)
// Direction: "northern construction site in winter" — cold daylight, steel, precision.
// The warm accent (--signal) appears in exactly one state: while a shift is running.

export type ThemeName = "light" | "dark";

export interface Theme {
  name: ThemeName;
  bg: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  signal: string; // active shift: timer, "finish" button, list indicator
  live: string; // confirmed GPS fix
  alert: string; // out-of-zone / errors
  onSignal: string; // text/icon on top of a signal-filled surface
  onLive: string;
}

export const light: Theme = {
  name: "light",
  bg: "#EDF1F5", // --frost
  surface: "#FFFFFF",
  surfaceMuted: "#E4EAF0",
  text: "#0B1320", // --ink
  textMuted: "#5A6B7C", // --steel
  border: "#D3DBE3",
  signal: "#E09000", // darker for >=4.5:1 on white
  live: "#1FA35C",
  alert: "#C8433A",
  onSignal: "#0B1320",
  onLive: "#FFFFFF",
};

export const dark: Theme = {
  name: "dark",
  bg: "#0B1320", // --ink
  surface: "#141D2B",
  surfaceMuted: "#1B2637",
  text: "#EDF1F5",
  textMuted: "#8296A8",
  border: "#22303F",
  signal: "#FFB020",
  live: "#2FBF71",
  alert: "#E2574C",
  onSignal: "#0B1320",
  onLive: "#06231A",
};

export const themes = { light, dark };

// Type scale + families. (DECISIONS D-003)
export const font = {
  display: "Archivo_700Bold", // used sparingly
  displayBlack: "Archivo_900Black",
  text: "Inter_400Regular",
  textMedium: "Inter_500Medium",
  textSemibold: "Inter_600SemiBold",
  mono: "JetBrainsMono_500Medium", // tabular figures — timer + all hours
};

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };
export const space = (n: number) => n * 4;
