import { I18n } from "i18n-js";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { en } from "./en";
import { et } from "./et";
import { ru } from "./ru";
import { fi } from "./fi";

export type Locale = "et" | "ru" | "en" | "fi";
const KEY = "locale-pref";

export const i18n = new I18n({ et, ru, en, fi });
i18n.enableFallback = true;
i18n.defaultLocale = "et";

export function deviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode ?? "et";
  return (["et", "ru", "en", "fi"] as const).includes(tag as Locale) ? (tag as Locale) : "et";
}

export async function initLocale(): Promise<Locale> {
  const saved = (await AsyncStorage.getItem(KEY)) as Locale | null;
  const loc = saved ?? deviceLocale();
  i18n.locale = loc;
  return loc;
}

export async function setLocale(loc: Locale): Promise<void> {
  i18n.locale = loc;
  await AsyncStorage.setItem(KEY, loc);
}

export const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);
