"use client";

import { useI18n } from "./I18nProvider";

export function T({ id }: { id: string }) {
  const { t } = useI18n();
  return <>{t(id)}</>;
}
