import React, { useEffect } from "react";
import { View, Text, StyleSheet, AccessibilityInfo } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** 0..1 of the target shift length */
  progress: number;
  /** the big monospaced clock string, e.g. "07:42:11" */
  label: string;
  /** true only while a shift is running — enables the warm signal color + breathing */
  active: boolean;
  size?: number;
  reducedMotion?: boolean;
}

// Signature element: giant mono timer inside a thin arc that fills over the 8h shift.
// The arc "breathes" (scale 1.0→1.008, 4s ease-in-out) only while active — legible from
// across a site, in gloves, in sunlight. Respects Reduce Motion. (spec §4)
export function TimerArc({ progress, label, active, size = 264, reducedMotion }: Props) {
  const { theme } = useTheme();
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const dash = useSharedValue(c); // full offset = empty
  const breathe = useSharedValue(1);
  const [reduce, setReduce] = React.useState(reducedMotion ?? false);

  useEffect(() => {
    if (reducedMotion === undefined) {
      AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
      const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
      return () => sub.remove();
    }
    setReduce(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    const target = c * (1 - Math.max(0, Math.min(1, progress)));
    dash.value = reduce ? target : withTiming(target, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [progress, c, reduce]);

  useEffect(() => {
    if (active && !reduce) {
      breathe.value = withRepeat(
        withSequence(
          withTiming(1.008, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(breathe);
      breathe.value = withTiming(1, { duration: 200 });
    }
    return () => cancelAnimation(breathe);
  }, [active, reduce]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }));
  const containerStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));

  const arcColor = active ? theme.signal : theme.textMuted;

  return (
    <Animated.View style={[{ width: size, height: size }, containerStyle]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.border}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          animatedProps={arcProps}
          // start the arc at 12 o'clock
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.center}>
          <Text
            style={[
              styles.timer,
              { color: active ? theme.signal : theme.text, fontFamily: font.mono, fontSize: Math.round(size * 0.16) },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={label}
          >
            {label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  timer: {
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
});
