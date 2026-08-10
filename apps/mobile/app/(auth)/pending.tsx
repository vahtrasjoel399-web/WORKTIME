import React, { useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/state/session";
import { useTheme } from "@/theme/ThemeProvider";
import { useLocale } from "@/i18n/LocaleProvider";
import { Screen, Title, Body, Muted } from "@/components/ui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { font, radius, space } from "@/theme/tokens";
import { t } from "@/i18n";

// Shown to a self-registered worker until the employer accepts them in the panel.
export default function Pending() {
  const { theme } = useTheme();
  useLocale();
  const { refreshProfile, profile } = useSession();
  const [checking, setChecking] = useState(false);

  async function recheck() {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
    if (profile?.is_approved) router.replace("/");
  }

  return (
    <Screen>
      <View style={styles.wrap}>
        <LanguageSwitcher />
        <View style={{ alignItems: "center", gap: space(4) }}>
          <View style={[styles.badge, { backgroundColor: theme.signal + "22", borderColor: theme.signal }]}>
            <Ionicons name="hourglass-outline" size={40} color={theme.signal} />
          </View>
          <Title style={{ fontSize: 26, textAlign: "center" }}>{t("pending.title")}</Title>
          <Body style={{ textAlign: "center", lineHeight: 22 }}>{t("pending.body")}</Body>
        </View>

        <View style={{ gap: space(3) }}>
          <Pressable onPress={recheck} disabled={checking} style={[styles.primary, { backgroundColor: theme.text }]}>
            {checking ? (
              <ActivityIndicator color={theme.bg} />
            ) : (
              <Body style={{ color: theme.bg, fontFamily: font.textSemibold }}>{t("pending.recheck")}</Body>
            )}
          </Pressable>
          <Pressable onPress={() => supabase.auth.signOut()} style={{ alignItems: "center", paddingVertical: space(3) }}>
            <Muted>{t("settings.signOut")}</Muted>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space(6), justifyContent: "space-between", paddingVertical: space(12) },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { borderRadius: radius.md, paddingVertical: space(4), alignItems: "center" },
});
