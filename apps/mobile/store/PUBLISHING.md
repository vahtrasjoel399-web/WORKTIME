# Publishing checklist

## 0. Prerequisites
- Expo account (`eas login`), `eas-cli` installed.
- Apple Developer Program membership; Google Play Console account.
- Filled `apps/mobile/.env` (or EAS secrets) with `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY`.
- Real bundle IDs set in `app.config.ts` (`ios.bundleIdentifier`, `android.package`) — currently `ee.pohjala.tooaeg`.

## 1. Store-side secrets (recommended over committing .env)
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key>
```

## 2. Build
```bash
eas build -p android --profile production   # → .aab
eas build -p ios     --profile production   # → .ipa
# quick shareable Android test build:
eas build -p android --profile preview      # → .apk
```

## 3. Submit
```bash
eas submit -p android --latest    # needs a Google service-account json
eas submit -p ios --latest        # needs App Store Connect API key
```

## 4. Store listings
- Copy from `listing.et.md`, `listing.en.md`, `listing.ru.md`.
- Screenshots: capture the shift home (active state, warm timer), My hours, Settings — in both light and dark.
- **Data safety / App privacy:** declare *Location — approximate & precise, used for App functionality, not shared, not for tracking*. Emphasise foreground-only, at start/stop only.
- Google Play: because we declare no background location, you avoid the prominent-disclosure + background-location review form. Keep `ACCESS_BACKGROUND_LOCATION` blocked (already set in `app.config.ts`).
- Apple: answer "Do you use location?" → *While Using the App*. No background modes are declared.

## 5. Legal
- Attach your privacy policy URL (must mention 24-month retention + employer notification).
- See the root README "Legal & GDPR" section — the employer must notify workers in writing before rollout.

## Icons & splash
`assets/icon.png` (1024², ink bg + signal arc), `assets/adaptive-icon.png` (Android foreground),
`assets/splash.png` (ink bg, centered arc). Replace with final artwork before public launch;
these are on-brand placeholders generated at scaffold time.
