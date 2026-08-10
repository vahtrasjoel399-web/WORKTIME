import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { useTheme } from "@/theme/ThemeProvider";
import { Screen, Title, Muted, Body, Card, Mono, Chip } from "@/components/ui";
import { CountUpMoney } from "@/components/CountUpMoney";
import { useSession } from "@/state/session";
import { getMonthShifts, type LocalShift } from "@/lib/db";
import { pullMonth } from "@/lib/sync";
import { workedSeconds, hoursDecimal, timeOfDay, hms } from "@/lib/time";
import { resolveRate, earningsFor } from "@/lib/earnings";
import { font, radius, space } from "@/theme/tokens";
import { t, i18n } from "@/i18n";

export default function Hours() {
  const { theme } = useTheme();
  const { profile } = useSession();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [shifts, setShifts] = useState<LocalShift[]>([]);
  const [dir, setDir] = useState(1);

  const load = useCallback(async () => {
    if (!profile) return;
    await pullMonth(profile.id, cursor.year, cursor.month);
    const rows = await getMonthShifts(profile.id, cursor.year, cursor.month);
    setShifts(rows.filter((s) => s.status === "closed"));
  }, [profile, cursor]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { rate, source } = useMemo(
    () => resolveRate(profile?.hourly_rate ?? null, profile?.self_hourly_rate ?? null),
    [profile],
  );

  const totalSeconds = useMemo(
    () => shifts.reduce((sum, s) => sum + workedSeconds(s.started_at, s.ended_at, s.break_seconds), 0),
    [shifts],
  );
  const totalEarnings = earningsFor(totalSeconds, rate);

  const byDay = useMemo(() => {
    const map = new Map<string, LocalShift[]>();
    for (const s of shifts) {
      const key = new Date(s.started_at).toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [shifts]);

  const showEarnings = profile?.show_earnings ?? true;
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(i18n.locale + "-EE", {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    setDir(delta);
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4) }}>
        <Title>{t("hours.title")}</Title>

        {/* month switcher */}
        <View style={styles.switcher}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <MotiView
            key={`${cursor.year}-${cursor.month}`}
            from={{ opacity: 0, translateX: dir * 24 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: "timing", duration: 260 }}
          >
            <Body style={{ fontFamily: font.textSemibold, fontSize: 17, textTransform: "capitalize" }}>
              {monthLabel}
            </Body>
          </MotiView>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={12}>
            <Ionicons name="chevron-forward" size={22} color={theme.text} />
          </Pressable>
        </View>

        {/* totals */}
        <Card>
          <Muted>{t("hours.total")}</Muted>
          <Mono style={{ fontSize: 40, color: theme.text, marginTop: 4 }}>
            {hoursDecimal(totalSeconds).toFixed(1)} {t("settings.hoursShort")}
          </Mono>

          {showEarnings && rate != null ? (
            <View style={{ marginTop: space(3) }}>
              <Muted>{t("hours.earnings")}</Muted>
              <CountUpMoney
                amount={totalEarnings}
                currency={profile?.currency ?? "EUR"}
                color={theme.text}
                style={{ fontSize: 26 }}
              />
              <Muted style={{ marginTop: 4 }}>
                {source === "company" ? t("hours.companyRate") : t("hours.personalEstimate")} ·{" "}
                {t("hours.beforeTax")}
              </Muted>
              <Muted style={{ marginTop: space(2), fontStyle: "italic" }}>{t("hours.payrollNote")}</Muted>
            </View>
          ) : showEarnings ? (
            <Muted style={{ marginTop: space(3) }}>{t("hours.setRate")}</Muted>
          ) : null}
        </Card>

        {/* days */}
        {byDay.length === 0 ? (
          <Card>
            <Body>{t("hours.empty")}</Body>
          </Card>
        ) : (
          byDay.map(([day, list], di) => {
            const daySeconds = list.reduce(
              (sum, s) => sum + workedSeconds(s.started_at, s.ended_at, s.break_seconds),
              0,
            );
            return (
              <Card key={day} index={di}>
                <View style={styles.dayHead}>
                  <Body style={{ fontFamily: font.textSemibold }}>
                    {new Date(day).toLocaleDateString(i18n.locale + "-EE", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </Body>
                  <Mono style={{ color: theme.text }}>{hoursDecimal(daySeconds).toFixed(1)} h</Mono>
                </View>
                {list.map((s) => (
                  <View key={s.local_id} style={[styles.shiftRow, { borderTopColor: theme.border }]}>
                    <Mono style={{ color: theme.textMuted, fontSize: 13 }}>
                      {timeOfDay(s.started_at, i18n.locale + "-EE")}–
                      {s.ended_at ? timeOfDay(s.ended_at, i18n.locale + "-EE") : "…"}
                    </Mono>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      {s.break_seconds > 0 && (
                        <Muted style={{ fontSize: 12 }}>
                          −{Math.round(s.break_seconds / 60)}m
                        </Muted>
                      )}
                      <Mono style={{ color: theme.text }}>
                        {hms(workedSeconds(s.started_at, s.ended_at, s.break_seconds))}
                      </Mono>
                    </View>
                  </View>
                ))}
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shiftRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: space(3),
    paddingTop: space(3),
  },
});
