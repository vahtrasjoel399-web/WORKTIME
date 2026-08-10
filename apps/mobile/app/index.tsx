import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@/state/session";
import { useTheme } from "@/theme/ThemeProvider";

// Entry gate: route to login → pending-approval → consent → app.
export default function Index() {
  const { loading, userId, profile, hasConsent } = useSession();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.signal} />
      </View>
    );
  }

  if (!userId) return <Redirect href="/(auth)/login" />;
  // a self-registered worker waits for the employer to accept them
  // (only block when explicitly false, so nothing breaks before the column exists)
  if (profile && profile.role === "worker" && profile.is_approved === false)
    return <Redirect href="/(auth)/pending" />;
  if (hasConsent === false) return <Redirect href="/(auth)/consent" />;
  return <Redirect href="/(app)" />;
}
