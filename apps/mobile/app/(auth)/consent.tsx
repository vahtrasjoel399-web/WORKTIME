import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/state/session";
import { useTheme } from "@/theme/ThemeProvider";
import { Screen, Title, Body, Muted } from "@/components/ui";
import { font, radius, space } from "@/theme/tokens";
import { t } from "@/i18n";

// GDPR: first-run consent for geolocation processing. The fact of consent, with a
// timestamp and version, is written to the DB. (spec §5, DECISIONS D-012)
export default function Consent() {
  const { theme } = useTheme();
  const { userId, refreshProfile } = useSession();
  const [busy, setBusy] = useState(false);

  async function agree() {
    if (!userId) return;
    setBusy(true);
    await supabase.from("consents").insert({
      user_id: userId,
      kind: "geolocation",
      version: "1",
      granted: true,
    });
    await refreshProfile();
    setBusy(false);
    router.replace("/(app)");
  }

  return (
    <Screen>
      <View style={styles.wrap}>
        <View style={{ gap: space(4) }}>
          <Title style={{ fontSize: 30 }}>{t("consent.title")}</Title>
          <Body style={{ lineHeight: 24 }}>{t("consent.body")}</Body>
          <Muted>{t("consent.retention")}</Muted>
        </View>

        <View style={{ gap: space(3) }}>
          <Pressable
            onPress={agree}
            disabled={busy}
            style={[styles.primary, { backgroundColor: theme.live, opacity: busy ? 0.6 : 1 }]}
          >
            <Body style={{ color: theme.onLive, fontFamily: font.textSemibold, fontSize: 16 }}>
              {t("consent.agree")}
            </Body>
          </Pressable>
          <Pressable onPress={() => supabase.auth.signOut()} style={styles.secondary}>
            <Muted>{t("consent.decline")}</Muted>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space(6), justifyContent: "space-between", paddingBottom: space(10) },
  primary: { borderRadius: radius.md, paddingVertical: space(4), alignItems: "center" },
  secondary: { alignItems: "center", paddingVertical: space(3) },
});
