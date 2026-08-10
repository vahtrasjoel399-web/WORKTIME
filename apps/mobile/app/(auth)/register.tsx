import React, { useState } from "react";
import { View, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router, Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/state/session";
import { useTheme } from "@/theme/ThemeProvider";
import { Screen, Title, Muted, Body } from "@/components/ui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";
import { font, radius, space } from "@/theme/tokens";
import { t } from "@/i18n";

// Worker self-registration: sign up, then join a company by its code via the
// register_worker RPC (SECURITY DEFINER — creates the profile the new user can't
// insert directly). First-user/company creation happens in the web admin panel.
export default function Register() {
  const { theme } = useTheme();
  useLocale(); // re-render on language change
  const { refreshProfile } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text, fontFamily: font.text },
  ];

  async function submit() {
    setBusy(true);
    setError(null);
    // 1) create the auth user (session starts if email confirmation is off)
    const { data: signUp, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (signErr) {
      setBusy(false);
      return setError(signErr.message.includes("already") ? t("register.exists") : t("register.error"));
    }
    // 2) attach to the company by code
    const { error: rpcErr } = await supabase.rpc("register_worker", {
      p_join_code: code.trim(),
      worker_first: firstName.trim(),
      worker_last: lastName.trim(),
    });
    setBusy(false);
    if (rpcErr) {
      // roll back is not possible client-side; user can retry the code on next login
      return setError(rpcErr.message.includes("invalid") ? t("register.invalidCode") : t("register.error"));
    }
    if (!signUp.session) {
      // email confirmation is on — tell them to confirm, then sign in
      return setError(t("auth.codeSent"));
    }
    await refreshProfile();
    router.replace("/");
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <LanguageSwitcher />
          <View style={{ gap: space(2) }}>
            <Title style={{ fontSize: 32 }}>{t("register.title")}</Title>
            <Muted>{t("register.subtitle")}</Muted>
          </View>

          <View style={{ gap: space(3) }}>
            <View style={{ flexDirection: "row", gap: space(3) }}>
              <TextInput style={[inputStyle, { flex: 1 }]} placeholder={t("register.firstName")} placeholderTextColor={theme.textMuted} value={firstName} onChangeText={setFirstName} />
              <TextInput style={[inputStyle, { flex: 1 }]} placeholder={t("register.lastName")} placeholderTextColor={theme.textMuted} value={lastName} onChangeText={setLastName} />
            </View>
            <TextInput style={inputStyle} placeholder={t("auth.email")} placeholderTextColor={theme.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextInput style={inputStyle} placeholder={t("auth.password")} placeholderTextColor={theme.textMuted} secureTextEntry value={password} onChangeText={setPassword} />
            <TextInput style={[inputStyle, { letterSpacing: 3, fontFamily: font.mono }]} placeholder={t("register.companyCode")} placeholderTextColor={theme.textMuted} autoCapitalize="characters" value={code} onChangeText={(v) => setCode(v.toUpperCase())} />

            <Pressable onPress={submit} disabled={busy} style={[styles.primary, { backgroundColor: theme.text, opacity: busy ? 0.6 : 1 }]}>
              <Body style={{ color: theme.bg, fontFamily: font.textSemibold, fontSize: 16 }}>{t("register.cta")}</Body>
            </Pressable>

            {error && <Body style={{ color: theme.alert }}>{error}</Body>}

            <Link href="/(auth)/login" asChild>
              <Pressable style={{ alignItems: "center", paddingVertical: space(3) }}>
                <Muted>{t("auth.haveAccount")}</Muted>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: space(6), justifyContent: "center", gap: space(6) },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(4),
    fontSize: 16,
  },
  primary: { borderRadius: radius.md, paddingVertical: space(4), alignItems: "center" },
});
