import type { Config } from "tailwindcss";

// Colors resolve to CSS variables (see app/globals.css) so the same class works in
// both themes. Token pairs come straight from the spec §4 table. (DECISIONS D-004)
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        border: "var(--border)",
        signal: "var(--signal)",
        live: "var(--live)",
        alert: "var(--alert)",
      },
      fontFamily: {
        display: ["Archivo", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
