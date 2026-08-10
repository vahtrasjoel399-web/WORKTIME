import React, { useEffect, useRef, useState } from "react";
import { Text, TextStyle } from "react-native";
import { formatMoney } from "@/lib/earnings";
import { font } from "@/theme/tokens";

interface Props {
  amount: number;
  currency: string;
  locale?: string;
  style?: TextStyle;
  color: string;
}

// Smoothly interpolates from the last shown value to the new target so the number
// grows without the digits jumping. Rendered in tabular mono so nothing shifts
// horizontally as it ticks. (spec §1 earnings, DECISIONS D-003)
export function CountUpMoney({ amount, currency, locale = "et-EE", style, color }: Props) {
  const [display, setDisplay] = useState(amount);
  const fromRef = useRef(amount);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = amount;
    const start = Date.now();
    const dur = 800;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      setDisplay(v);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = amount;
    };
  }, [amount]);

  return (
    <Text
      style={[{ fontFamily: font.mono, fontVariant: ["tabular-nums"], color }, style]}
      accessibilityLabel={formatMoney(amount, currency, locale)}
    >
      {formatMoney(display, currency, locale)}
    </Text>
  );
}
