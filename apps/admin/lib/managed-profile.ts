import type { PricingType } from "@/lib/pricing";

export type ManagedAccountRole = "worker" | "accountant";

type ManagedProfileInput = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
  initialSiteId: string;
  role: ManagedAccountRole;
  locale: string;
  rate: number | null;
  pricingType: PricingType;
  pricingUnit: string;
};

export function buildManagedProfile(input: ManagedProfileInput) {
  const isWorker = input.role === "worker";

  return {
    id: input.id,
    company_id: input.companyId,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone || null,
    position: input.position || null,
    default_site_id: isWorker ? input.initialSiteId || null : null,
    role: input.role,
    is_active: true,
    is_approved: true,
    locale: ["et", "ru", "en", "fi"].includes(input.locale) ? input.locale : "et",
    hourly_rate: isWorker ? input.rate : null,
    ...(isWorker
      ? {
          pricing_type: input.pricingType,
          pricing_unit: input.pricingType === "quantity" ? input.pricingUnit : null,
        }
      : {}),
  };
}
