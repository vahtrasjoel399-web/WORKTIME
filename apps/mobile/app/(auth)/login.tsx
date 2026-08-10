import React, { useState } from "react";
import { View, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { router, Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeProvider";
import { Screen, Title, Muted, Body, SegRow } from "@/components/ui";
import { font, radius, space } from "@/theme/tokens";
import { t } from "@/i18n";

type Method = "email" | "phone";

export default function Login() {
  const { theme } = useTheme();
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text, fontFamily: font.text },
  ];

  async function signInEmail() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(t("auth.invalid"));
    router.replace("/");
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
    setBusy(false);
    if (error) return setError(t("auth.genericError"));
    setCodeSent(true);
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: phone.trim(), token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) return setError(t("auth.genericError"));
    router.replace("/");
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}
      >
        <View style={{ gap: space(2) }}>
          <Title style={{ fontSize: 34 }}>{t("auth.title")}</Title>
          <Muted>{t("auth.subtitle")}</Muted>
        </View>

        <SegRow<Method>
          value={method}
          onChange={(m) => {
            setMethod(m);
            setError(null);
          }}
          options={[
            { value: "email", label: t("auth.withEmail") },
            { value: "phone", label: t("auth.withPhone") },
          ]}
        />

        {method === "email" ? (
          <View style={{ gap: space(3) }}>
            <TextInput
              style={inputStyle}
              placeholder={t("auth.email")}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={inputStyle}
              placeholder={t("auth.password")}
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <PrimaryButton label={t("auth.signIn")} onPress={signInEmail} busy={busy} />
          </View>
        ) : (
          <View style={{ gap: space(3) }}>
            <TextInput
              style={inputStyle}
              placeholder={t("auth.phone")}
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              editable={!codeSent}
            />
            {codeSent && (
              <TextInput
                style={inputStyle}
                placeholder={t("auth.code")}
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
              />
            )}
            <PrimaryButton
              label={codeSent ? t("auth.verify") : t("auth.sendCode")}
              onPress={codeSent ? verifyCode : sendCode}
              busy={busy}
            />
            {codeSent && <Muted>{t("auth.codeSent")}</Muted>}
          </View>
        )}

        {error && <Body style={{ color: theme.alert }}>{error}</Body>}

        <Link href="/(auth)/register" asChild>
          <Pressable style={{ alignItems: "center", paddingVertical: space(2) }}>
            <Muted>{t("auth.noAccount")}</Muted>
          </Pressable>
        </Link>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PrimaryButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.primary, { backgroundColor: theme.text, opacity: busy ? 0.6 : 1 }]}
    >
      <Body style={{ color: theme.bg, fontFamily: font.textSemibold, fontSize: 16 }}>{label}</Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space(6), justifyContent: "center", gap: space(6) },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(4),
    fontSize: 16,
  },
  primary: {
    borderRadius: radius.md,
    paddingVertical: space(4),
    alignItems: "center",
  },
});
