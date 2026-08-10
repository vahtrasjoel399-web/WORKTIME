import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n";
import { font, radius } from "@/theme/tokens";

const LANGS: { code: Locale; label: string }[] = [
  { code: "et", label: "ET" },
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
  { code: "fi", label: "FI" },
];

// Compact language switcher for the auth screens — pick a language before signing in.
export function LanguageSwitcher() {
  const { theme } = useTheme();
  const { locale, change } = useLocale();
  return (
    <View style={styles.row}>
      {LANGS.map((l) => {
        const active = l.code === locale;
        return (
          <Pressable
            key={l.code}
            onPress={() => change(l.code)}
            style={[
              styles.pill,
              { borderColor: active ? theme.signal : theme.border, backgroundColor: active ? theme.signal + "22" : "transparent" },
            ]}
          >
            <Text style={{ color: active ? theme.signal : theme.textMuted, fontFamily: font.textMedium, fontSize: 13 }}>
              {l.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "center" },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 44,
    alignItems: "center",
  },
});
