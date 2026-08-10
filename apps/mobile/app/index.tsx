import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@/state/session";
import { useTheme } from "@/theme/ThemeProvider";

// Entry gate: route to login → consent → app based on session + consent state.
export default function Index() {
  const { loading, userId, hasConsent } = useSession();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.signal} />
      </View>
    );
  }

  if (!userId) return <Redirect href="/(auth)/login" />;
  if (hasConsent === false) return <Redirect href="/(auth)/consent" />;
  return <Redirect href="/(app)" />;
}
