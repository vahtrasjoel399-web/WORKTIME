import { ExpoConfig, ConfigContext } from "expo/config";

// Permission strings are intentionally specific: location is read only at the two
// moments of clocking in and out. Localized copies live in src/i18n; these are the
// store-review defaults (EN/ET blended) shown by the OS.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Tööaeg",
  slug: "tooaeg",
  scheme: "tooaeg",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0B1320",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: "ee.pohjala.tooaeg",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Location is recorded only when you start and finish a shift, to mark where the shift began and ended.",
      UIBackgroundModes: [],
    },
  },
  android: {
    package: "ee.pohjala.tooaeg",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0B1320",
    },
    permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
    blockedPermissions: ["ACCESS_BACKGROUND_LOCATION"],
  },
  plugins: [
    "expo-router",
    "expo-localization",
    "expo-font",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Location is recorded only when you start and finish a shift.",
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // NOTE: `eas.projectId` is intentionally omitted here — its presence makes the
    // CLI require an EAS login even for local Expo Go dev. It is added automatically
    // when you run `eas build:configure` before your first store build.
  },
});
