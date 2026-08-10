import React, { useMemo } from "react";
import { View, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { MotiView, AnimatePresence } from "moti";
import { useTheme } from "@/theme/ThemeProvider";
import { Screen, Title, Muted, Body, Chip, Mono } from "@/components/ui";
import { TimerArc } from "@/components/TimerArc";
import { ShiftButton } from "@/components/ShiftButton";
import { CountUpMoney } from "@/components/CountUpMoney";
import { useSession } from "@/state/session";
import { useShiftController } from "@/state/shift";
import { resolveRate, earningsFor } from "@/lib/earnings";
import { hms } from "@/lib/time";
import { font, space, radius } from "@/theme/tokens";
import { t } from "@/i18n";

export default function Home() {
  const { theme } = useTheme();
  const { profile } = useSession();
  const { state, start, finish, toggleBreak, clearSummary } = useShiftController(profile);
  const { width, height } = useWindowDimensions();
  // timer scales to the smaller screen dimension so it fits every phone
  const timerSize = Math.max(180, Math.min(width * 0.68, height * 0.38, 300));

  const targetSeconds = (profile?.target_shift_hours ?? 8) * 3600;
  const progress = state.seconds / targetSeconds;

  const { rate, source } = useMemo(
    () => resolveRate(profile?.hourly_rate ?? null, profile?.self_hourly_rate ?? null),
    [profile?.hourly_rate, profile?.self_hourly_rate],
  );
  const showEarnings = profile?.show_earnings ?? true;
  const earnings = earningsFor(state.seconds, rate);
  const active = state.phase === "running" || state.phase === "onBreak";

  return (
    <Screen>
      <View style={styles.wrap}>
        {/* header row: site + gps */}
        <View style={styles.header}>
          <View style={{ gap: 4 }}>
            <Title style={{ fontSize: 22 }}>
              {profile ? `${profile.first_name}` : ""}
            </Title>
            <Muted>
              {state.shift?.site_id ? t("home.atSite", { site: "" }).trim() : t("home.noSite")}
            </Muted>
          </View>
          {state.gps === "confirmed" && <Chip label={t("home.gpsConfirmed")} color={theme.live} />}
          {state.gps === "pending" && <Chip label={t("home.gpsPending")} color={theme.textMuted} />}
        </View>

        {/* signature timer */}
        <View style={styles.timerWrap}>
          <TimerArc progress={progress} label={hms(state.seconds)} active={active} size={timerSize} />
          {active && (
            <MotiView
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ delay: 120 }}
            >
              <Muted style={{ textAlign: "center", marginTop: space(3) }}>
                {state.phase === "onBreak" ? t("home.onBreak") : t("home.earnedNow")}
              </Muted>
            </MotiView>
          )}

          {/* live earnings count-up */}
          {active && showEarnings && rate != null && (
            <MotiView
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 200 }}
              style={{ alignItems: "center", marginTop: space(1) }}
            >
              <CountUpMoney
                amount={earnings}
                currency={profile?.currency ?? "EUR"}
                color={theme.signal}
                style={{ fontSize: 30 }}
              />
              <Muted style={{ marginTop: 4 }}>
                {source === "company" ? t("hours.companyRate") : t("hours.personalEstimate")} ·{" "}
                {t("hours.beforeTax")}
              </Muted>
            </MotiView>
          )}
        </View>

        {/* actions */}
        <View style={{ gap: space(4) }}>
          {state.phase === "idle" ? (
            <ShiftButton mode="start" label={t("home.start")} onPress={start} busy={state.busy} />
          ) : (
            <>
              <ShiftButton mode="finish" label={t("home.finish")} onPress={finish} busy={state.busy} />
              <Pressable onPress={toggleBreak} style={[styles.breakBtn, { borderColor: theme.border }]}>
                <Body style={{ color: theme.text, fontFamily: font.textMedium }}>
                  {state.phase === "onBreak" ? t("home.resume") : t("home.pause")}
                </Body>
              </Pressable>
            </>
          )}

          {state.error === "location-denied" && (
            <Body style={{ color: theme.alert, textAlign: "center" }}>{t("home.locationDenied")}</Body>
          )}
        </View>
      </View>

      {/* finish summary — springs up over the screen */}
      <AnimatePresence>
        {state.lastSummarySeconds != null && (
          <MotiView
            key="summary"
            from={{ translateY: 400, opacity: 0 }}
            animate={{ translateY: 0, opacity: 1 }}
            exit={{ translateY: 400, opacity: 0 }}
            transition={{ type: "spring", damping: 18, stiffness: 180 }}
            style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Muted>{t("home.summaryTitle")}</Muted>
            <Muted style={{ marginTop: space(2) }}>{t("home.worked")}</Muted>
            <Mono style={{ fontSize: 52, color: theme.text, marginVertical: space(1) }}>
              {hms(state.lastSummarySeconds)}
            </Mono>
            <Pressable onPress={clearSummary} style={[styles.okBtn, { backgroundColor: theme.text }]}>
              <Body style={{ color: theme.bg, fontFamily: font.textSemibold }}>OK</Body>
            </Pressable>
          </MotiView>
        )}
      </AnimatePresence>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space(6), justifyContent: "space-between" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  timerWrap: { alignItems: "center", justifyContent: "center", flex: 1 },
  breakBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: space(3),
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: space(8),
  },
  summary: {
    position: "absolute",
    left: space(4),
    right: space(4),
    bottom: space(6),
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space(6),
    alignItems: "center",
  },
  okBtn: {
    marginTop: space(4),
    paddingHorizontal: space(10),
    paddingVertical: space(3),
    borderRadius: radius.pill,
  },
});
