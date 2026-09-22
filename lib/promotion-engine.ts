export type PromotionDiscountType = "PERCENT" | "FIXED_AMOUNT" | "FREE_ACCESS";

export type PromotionDefinition = {
  id: string;
  code: string;
  name: string;
  description: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  currency: string;
  maxTotalUses?: number | null;
  maxUsesPerUser?: number | null;
  validFrom?: number | null;
  validUntil?: number | null;
  minimumOrderAmount?: number | null;
  newUsersOnly?: boolean;
  allowedTestIds?: string[];
  allowedEmailDomains?: string[];
  allowedUserIds?: string[];
  campaignId?: string | null;
  status: string;
};

export type PromotionRequestContext = {
  nowMs: number;
  userId: string;
  email: string;
  testId: string;
  currency: string;
  originalAmountMinor: number;
  existingUser: boolean;
};

export type PromotionCalculation = {
  originalAmountMinor: number;
  discountAmountMinor: number;
  finalAmountMinor: number;
  freeAccess: boolean;
};

export function normalizePromoCode(value: string) {
  return value.trim().toUpperCase();
}

export function validatePromotionDefinition(input: Omit<PromotionDefinition, "status"> & { status?: string }) {
  const code = normalizePromoCode(input.code);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(code)) throw new Error("PROMO_CODE_INVALID");
  if (!input.name?.trim()) throw new Error("PROMO_NAME_REQUIRED");
  if (!/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())) throw new Error("PROMO_CURRENCY_INVALID");
  if (!(input.discountType === "PERCENT" || input.discountType === "FIXED_AMOUNT" || input.discountType === "FREE_ACCESS")) throw new Error("PROMO_DISCOUNT_TYPE_INVALID");
  if (!Number.isSafeInteger(input.discountValue) || input.discountValue < 0) throw new Error("PROMO_DISCOUNT_VALUE_INVALID");
  if (input.discountType === "PERCENT" && (input.discountValue < 1 || input.discountValue > 100)) throw new Error("PROMO_PERCENT_OUT_OF_RANGE");
  if (input.discountType === "FIXED_AMOUNT" && input.discountValue <= 0) throw new Error("PROMO_FIXED_AMOUNT_INVALID");
  for (const value of [input.maxTotalUses, input.maxUsesPerUser]) {
    if (value !== null && value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error("PROMO_LIMIT_INVALID");
  }
  if (input.validFrom !== null && input.validFrom !== undefined && !Number.isSafeInteger(input.validFrom)) throw new Error("PROMO_VALID_FROM_INVALID");
  if (input.validUntil !== null && input.validUntil !== undefined && !Number.isSafeInteger(input.validUntil)) throw new Error("PROMO_VALID_UNTIL_INVALID");
  if (input.validFrom !== null && input.validFrom !== undefined && input.validUntil !== null && input.validUntil !== undefined && input.validFrom >= input.validUntil) throw new Error("PROMO_DATE_RANGE_INVALID");
  if (input.minimumOrderAmount !== null && input.minimumOrderAmount !== undefined && (!Number.isSafeInteger(input.minimumOrderAmount) || input.minimumOrderAmount < 0)) throw new Error("PROMO_MINIMUM_INVALID");
  return { ...input, code, currency: input.currency.trim().toUpperCase(), status: input.status ?? "ACTIVE" };
}

function normalizedList(values: readonly string[] | undefined) {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function calculatePromotion(definition: PromotionDefinition, context: PromotionRequestContext): PromotionCalculation {
  const currency = context.currency.trim().toUpperCase();
  if (definition.status !== "ACTIVE") throw new Error(definition.status === "DISABLED" ? "PROMO_DISABLED" : "PROMO_NOT_ACTIVE");
  if (definition.validFrom !== null && definition.validFrom !== undefined && context.nowMs < definition.validFrom) throw new Error("PROMO_NOT_STARTED");
  if (definition.validUntil !== null && definition.validUntil !== undefined && context.nowMs >= definition.validUntil) throw new Error("PROMO_EXPIRED");
  if (definition.currency.trim().toUpperCase() !== currency) throw new Error("PROMO_CURRENCY_MISMATCH");
  if (!Number.isSafeInteger(context.originalAmountMinor) || context.originalAmountMinor <= 0) throw new Error("PROMO_AMOUNT_INVALID");
  if (definition.minimumOrderAmount !== null && definition.minimumOrderAmount !== undefined && context.originalAmountMinor < definition.minimumOrderAmount) throw new Error("PROMO_MINIMUM_NOT_MET");
  if (definition.allowedTestIds?.length && !definition.allowedTestIds.includes(context.testId)) throw new Error("PROMO_TEST_NOT_ALLOWED");
  if (definition.newUsersOnly && context.existingUser) throw new Error("PROMO_NEW_USERS_ONLY");
  const allowedUsers = normalizedList(definition.allowedUserIds);
  if (allowedUsers.size && !allowedUsers.has(context.userId.trim().toLowerCase())) throw new Error("PROMO_USER_NOT_ALLOWED");
  const allowedDomains = normalizedList(definition.allowedEmailDomains);
  if (allowedDomains.size) {
    const domain = context.email.trim().toLowerCase().split("@").pop() ?? "";
    if (!allowedDomains.has(domain)) throw new Error("PROMO_EMAIL_DOMAIN_NOT_ALLOWED");
  }
  let discountAmountMinor = definition.discountType === "PERCENT"
    ? Math.floor(context.originalAmountMinor * definition.discountValue / 100)
    : definition.discountType === "FIXED_AMOUNT"
      ? definition.discountValue
      : context.originalAmountMinor;
  discountAmountMinor = Math.max(0, Math.min(context.originalAmountMinor, discountAmountMinor));
  const finalAmountMinor = Math.max(0, context.originalAmountMinor - discountAmountMinor);
  return {
    originalAmountMinor: context.originalAmountMinor,
    discountAmountMinor,
    finalAmountMinor,
    freeAccess: definition.discountType === "FREE_ACCESS" || finalAmountMinor === 0,
  };
}
