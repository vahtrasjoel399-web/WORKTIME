import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { font, radius } from "@/theme/tokens";

interface Props {
  mode: "start" | "finish";
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}

// Minimum 96x96 dp, hittable in work gloves. Start = neutral steel; Finish = warm signal.
// Press: scale-down + haptic success. (spec §4)
export function ShiftButton({ mode, label, onPress, busy, disabled }: Props) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = mode === "finish" ? theme.signal : theme.text;
  const fg = mode === "finish" ? theme.onSignal : theme.bg;

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy || disabled}
        onPressIn={() => (scale.value = withSpring(0.94, { damping: 14, stiffness: 260 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 12, stiffness: 220 }))}
        onPress={() => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onPress();
        }}
        style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.inner}>
            <Text style={[styles.label, { color: fg }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: 96,
    minHeight: 96,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  inner: { alignItems: "center", justifyContent: "center" },
  label: { fontFamily: font.display, fontSize: 20, letterSpacing: 0.3 },
});
