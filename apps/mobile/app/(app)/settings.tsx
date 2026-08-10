import React, { useState } from "react";
import { View, StyleSheet, Switch, TextInput, Pressable, ScrollView } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Screen, Title, Muted, Body, Card, SegRow } from "@/components/ui";
import { useSession } from "@/state/session";
import { useLocale } from "@/i18n/LocaleProvider";
import { t, type Locale } from "@/i18n";
import { font, radius, space } from "@/theme/tokens";

export default function Settings() {
  const { theme, pref, setPref } = useTheme();
  const { change: changeLocale } = useLocale();
  const { profile, updateProfile, signOut } = useSession();
  const [rate, setRate] = useState(
    profile?.self_hourly_rate != null ? String(profile.self_hourly_rate) : "",
  );
  const [target, setTarget] = useState(String(profile?.target_shift_hours ?? 8));

  const companyRate = profile?.hourly_rate ?? null;

  function saveRate() {
    const v = parseFloat(rate.replace(",", "."));
    if (!isNaN(v)) updateProfile({ self_hourly_rate: v });
  }
  function saveTarget() {
    const v = parseFloat(target.replace(",", "."));
    if (!isNaN(v) && v > 0) updateProfile({ target_shift_hours: v });
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text, fontFamily: font.mono },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4) }}>
        <Title>{t("settings.title")}</Title>

        {/* rate */}
        <Card>
          <Muted>{t("settings.rate")}</Muted>
          {companyRate != null ? (
            <View style={{ marginTop: space(2) }}>
              <Body style={{ fontFamily: font.mono, fontSize: 22 }}>
                {companyRate.toFixed(2)} {profile?.currency}/h
              </Body>
              <Muted style={{ marginTop: 4 }}>{t("settings.rateFromCompany")}</Muted>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: space(3), alignItems: "center", marginTop: space(2) }}>
              <TextInput
                style={[inputStyle, { flex: 1 }]}
                keyboardType="decimal-pad"
                value={rate}
                onChangeText={setRate}
                onBlur={saveRate}
                placeholder="0.00"
                placeholderTextColor={theme.textMuted}
              />
              <Body style={{ color: theme.textMuted }}>{profile?.currency}/h</Body>
            </View>
          )}
        </Card>

        {/* target hours */}
        <Card>
          <Muted>{t("settings.targetHours")}</Muted>
          <View style={{ flexDirection: "row", gap: space(3), alignItems: "center", marginTop: space(2) }}>
            <TextInput
              style={[inputStyle, { width: 100 }]}
              keyboardType="decimal-pad"
              value={target}
              onChangeText={setTarget}
              onBlur={saveTarget}
            />
            <Body style={{ color: theme.textMuted }}>{t("settings.hoursShort")}</Body>
          </View>
        </Card>

        {/* show earnings */}
        <Card>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: space(4) }}>
              <Body style={{ fontFamily: font.textMedium }}>{t("settings.showEarnings")}</Body>
              <Muted style={{ marginTop: 4 }}>{t("settings.showEarningsHint")}</Muted>
            </View>
            <Switch
              value={profile?.show_earnings ?? true}
              onValueChange={(v) => updateProfile({ show_earnings: v })}
              trackColor={{ true: theme.signal }}
            />
          </View>
        </Card>

        {/* language */}
        <Card>
          <Muted style={{ marginBottom: space(2) }}>{t("settings.language")}</Muted>
          <SegRow<Locale>
            value={(profile?.locale as Locale) ?? "et"}
            onChange={(l) => {
              void changeLocale(l);
              updateProfile({ locale: l });
            }}
            options={[
              { value: "et", label: "ET" },
              { value: "ru", label: "RU" },
              { value: "en", label: "EN" },
              { value: "fi", label: "FI" },
            ]}
          />
        </Card>

        {/* theme */}
        <Card>
          <Muted style={{ marginBottom: space(2) }}>{t("settings.theme")}</Muted>
          <SegRow
            value={pref}
            onChange={(p) => {
              setPref(p);
              updateProfile({ theme: p });
            }}
            options={[
              { value: "light", label: t("settings.light") },
              { value: "dark", label: t("settings.dark") },
              { value: "system", label: t("settings.system") },
            ]}
          />
        </Card>

        <Pressable onPress={signOut} style={[styles.signOut, { borderColor: theme.alert }]}>
          <Body style={{ color: theme.alert, fontFamily: font.textSemibold }}>{t("settings.signOut")}</Body>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: 18,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  signOut: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: space(4),
    alignItems: "center",
    marginTop: space(2),
  },
});
