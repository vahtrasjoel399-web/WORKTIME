import React, { useState } from "react";
import { View, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeProvider";
import { Screen, Title, Muted, Body } from "@/components/ui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";
import { font, radius, space } from "@/theme/tokens";
import { t } from "@/i18n";

export default function Login() {
  const { theme } = useTheme();
  useLocale(); // subscribe so switching language re-renders this screen
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text, fontFamily: font.text },
  ];

  async function signInEmail() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setBusy(false);
      return setError(t("auth.invalid"));
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active, is_approved")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || profile.role !== "worker" || profile.is_active === false) {
      await supabase.auth.signOut();
      setBusy(false);
      return setError(t("auth.workerOnly"));
    }
    setBusy(false);
    router.replace("/");
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <LanguageSwitcher />

          <View style={{ gap: space(2) }}>
            <Title style={{ fontSize: 32 }}>{t("auth.title")}</Title>
            <Muted>{t("auth.subtitle")}</Muted>
          </View>

          <View style={{ gap: space(3) }}>
            <TextInput style={inputStyle} placeholder={t("auth.email")} placeholderTextColor={theme.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextInput style={inputStyle} placeholder={t("auth.password")} placeholderTextColor={theme.textMuted} secureTextEntry value={password} onChangeText={setPassword} />
            <PrimaryButton label={t("auth.signIn")} onPress={signInEmail} busy={busy} />
          </View>

          {error && <Body style={{ color: theme.alert }}>{error}</Body>}

        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PrimaryButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={busy} style={[styles.primary, { backgroundColor: theme.text, opacity: busy ? 0.6 : 1 }]}>
      <Body style={{ color: theme.bg, fontFamily: font.textSemibold, fontSize: 16 }}>{label}</Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: space(6), justifyContent: "center", gap: space(5) },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(4),
    fontSize: 16,
  },
  primary: { borderRadius: radius.md, paddingVertical: space(4), alignItems: "center" },
});
