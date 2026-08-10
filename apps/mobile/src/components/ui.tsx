import React from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useTheme } from "@/theme/ThemeProvider";
import { font, radius, space } from "@/theme/tokens";

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.bg }, style]}>{children}</SafeAreaView>
  );
}

export function Card({
  children,
  style,
  index = 0,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  index?: number;
}) {
  const { theme } = useTheme();
  // List entrance: stagger 30ms. (spec §4)
  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 260, delay: index * 30 }}
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </MotiView>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.title, { color: theme.text, fontFamily: font.display }, style]}>
      {children}
    </Text>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.muted, { color: theme.textMuted, fontFamily: font.text }, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.body, { color: theme.text, fontFamily: font.text }, style]}>
      {children}
    </Text>
  );
}

export function Mono({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { theme } = useTheme();
  return (
    <Text
      style={[
        { color: theme.text, fontFamily: font.mono, fontVariant: ["tabular-nums"] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: color + "22", borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color, fontFamily: font.textMedium, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function SegRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: theme.surfaceMuted }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, active && { backgroundColor: theme.surface }]}
          >
            <Text
              style={{
                color: active ? theme.text : theme.textMuted,
                fontFamily: font.textMedium,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space(4),
  },
  title: { fontSize: 26 },
  muted: { fontSize: 13 },
  body: { fontSize: 15 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    alignSelf: "flex-start",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  seg: {
    flexDirection: "row",
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: "center",
  },
});
