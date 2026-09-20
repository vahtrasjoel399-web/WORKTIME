export type PricingType = "hourly" | "area" | "quantity";

export const PRICING_LABELS: Record<PricingType, string> = {
  hourly: "Tunnipõhine",
  area: "m² põhine",
  quantity: "Kogusepõhine",
};

export function pricingUnit(type: PricingType, customUnit?: string | null): string {
  if (type === "hourly") return "h";
  if (type === "area") return "m²";
  return customUnit?.trim() || "ühik";
}

export function calculatePricingTotal({
  pricingType,
  rate,
  workedSeconds,
  quantity,
}: {
  pricingType: PricingType;
  rate: number | null;
  workedSeconds?: number | null;
  quantity?: number | null;
}): number | null {
  if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
  const basis = pricingType === "hourly" ? Math.max(0, workedSeconds ?? 0) / 3600 : quantity;
  if (basis == null || !Number.isFinite(basis) || basis < 0) return null;
  return Math.round(basis * rate * 100) / 100;
}

export function shiftTotal(
  shift: {
    pricing_type?: PricingType | null;
    pricing_rate?: number | null;
    quantity?: number | null;
    calculated_total?: number | null;
    worked_seconds?: number | null;
  },
  fallbackRate: number | null = null,
): number {
  if (shift.calculated_total != null) return Number(shift.calculated_total);
  return calculatePricingTotal({
    pricingType: shift.pricing_type ?? "hourly",
    rate: shift.pricing_rate ?? fallbackRate,
    workedSeconds: shift.worked_seconds,
    quantity: shift.quantity,
  }) ?? 0;
}

export function validPricingConfig(type: PricingType, rate: number | null, unit: string | null): string | null {
  if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 1_000_000)) return "Kontrolli hinda.";
  if (type !== "hourly" && rate == null) return "Selle hinnatüübi jaoks sisesta hind.";
  if (type === "quantity" && !unit?.trim()) return "Kogusepõhise hinna jaoks sisesta ühik.";
  if (unit && unit.trim().length > 24) return "Ühik võib olla kuni 24 tähemärki.";
  return null;
}
