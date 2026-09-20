import React, { useMemo, useState } from "react";
import { Alert, Platform, View, StyleSheet, Pressable, TextInput, useWindowDimensions } from "react-native";
import { MotiView, AnimatePresence } from "moti";
import { useTheme } from "@/theme/ThemeProvider";
import { Screen, Title, Muted, Body, Chip, Mono } from "@/components/ui";
import { TimerArc } from "@/components/TimerArc";
import { ShiftButton } from "@/components/ShiftButton";
import { CountUpMoney } from "@/components/CountUpMoney";
import { useSession } from "@/state/session";
import { useShiftController } from "@/state/shift";
import { resolveRate, earningsFor, formatMoney, pricingTotal } from "@/lib/earnings";
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
  const [showCompletion, setShowCompletion] = useState(false);
  const [quantity, setQuantity] = useState("");

  const targetSeconds = (profile?.target_shift_hours ?? 8) * 3600;
  const progress = state.seconds / targetSeconds;

  const { rate, source } = useMemo(
    () => resolveRate(profile?.hourly_rate ?? null, profile?.self_hourly_rate ?? null),
    [profile?.hourly_rate, profile?.self_hourly_rate],
  );
  const showEarnings = profile?.show_earnings ?? true;
  const earnings = earningsFor(state.seconds, rate);
  const active = state.phase === "running" || state.phase === "onBreak";
  const activePricingType = state.shift?.pricing_type ?? profile?.pricing_type ?? "hourly";
  const activeRate = state.shift?.pricing_rate ?? (activePricingType === "hourly" ? rate : profile?.hourly_rate ?? null);
  const activeUnit = state.shift?.unit ?? (activePricingType === "area" ? "m²" : profile?.pricing_unit ?? null);
  const parsedQuantity = quantity.trim() ? Number(quantity.replace(",", ".")) : Number.NaN;
  const completionTotal = pricingTotal(activePricingType, activeRate, state.seconds, parsedQuantity);

  const confirmFinish = (completed: number | null = null) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${t("home.finishConfirmTitle")}\n\n${t("home.finishConfirmMessage")}`)) {
        setShowCompletion(false);
        void finish(completed);
      }
      return;
    }
    Alert.alert(t("home.finishConfirmTitle"), t("home.finishConfirmMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("home.finishConfirmAction"), style: "destructive", onPress: () => { setShowCompletion(false); void finish(completed); } },
    ]);
  };

  const requestFinish = () => {
    if (activePricingType === "hourly") confirmFinish();
    else setShowCompletion(true);
  };

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
          {active && activePricingType === "hourly" && showEarnings && rate != null && (
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
              <ShiftButton mode="finish" label={t("home.finish")} onPress={requestFinish} busy={state.busy} />
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

          {showCompletion && activePricingType !== "hourly" && (
            <View style={[styles.completion, { backgroundColor: theme.surface, borderColor: theme.signal }]}>
              <Muted>{activePricingType === "area" ? "Tehtud kogus (m²)" : `Kogus (${activeUnit ?? "ühik"})`}</Muted>
              <TextInput
                autoFocus
                keyboardType="decimal-pad"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
                style={[styles.quantityInput, { color: theme.text, borderColor: theme.border }]}
              />
              <Body style={{ textAlign: "right", fontFamily: font.mono, color: theme.signal }}>
                Kokku: {completionTotal == null ? "—" : formatMoney(completionTotal, profile?.currency ?? "EUR")}
              </Body>
              <View style={{ flexDirection: "row", gap: space(2) }}>
                <Pressable disabled={completionTotal == null} onPress={() => confirmFinish(parsedQuantity)} style={[styles.confirmCompletion, { backgroundColor: theme.text, opacity: completionTotal == null ? 0.5 : 1 }]}>
                  <Body style={{ color: theme.bg, fontFamily: font.textSemibold }}>Salvesta ja lõpeta</Body>
                </Pressable>
                <Pressable onPress={() => setShowCompletion(false)} style={[styles.cancelCompletion, { borderColor: theme.border }]}>
                  <Body>Tühista</Body>
                </Pressable>
              </View>
            </View>
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
            {state.lastSummaryAmount != null && (
              <Body style={{ color: theme.signal, fontFamily: font.mono, fontSize: 24 }}>
                {formatMoney(state.lastSummaryAmount, profile?.currency ?? "EUR")}
              </Body>
            )}
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
  completion: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  quantityInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space(4), paddingVertical: space(3), fontFamily: font.mono, fontSize: 20 },
  confirmCompletion: { flex: 1, borderRadius: radius.md, paddingVertical: space(3), alignItems: "center" },
  cancelCompletion: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space(4), justifyContent: "center" },
});
