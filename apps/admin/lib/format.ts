export function hours1(seconds: number | null): string {
  if (seconds == null) return "—";
  return (Math.round((seconds / 3600) * 10) / 10).toFixed(1);
}

export function hm(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("et-EE", { hour: "2-digit", minute: "2-digit" });
}

export function dmy(iso: string): string {
  return new Date(iso).toLocaleDateString("et-EE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function money(amount: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("et-EE", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function monthRange(year: number, month: number) {
  return {
    from: new Date(Date.UTC(year, month, 1)).toISOString(),
    to: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}
