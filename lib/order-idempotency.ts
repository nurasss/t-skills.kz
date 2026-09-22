export type OrderIdempotencyInput = {
  testId: string;
  amountMinor: number;
  currency: string;
  provider: string;
  promoCode: string | null;
};

export function canonicalOrderIdempotencyPayload(input: OrderIdempotencyInput) {
  return {
    amount_minor: input.amountMinor,
    currency: input.currency.toUpperCase(),
    provider: input.provider,
    promo_code: input.promoCode,
    test_id: input.testId,
  } as const;
}

export function serializeOrderIdempotencyPayload(input: OrderIdempotencyInput) {
  return JSON.stringify(canonicalOrderIdempotencyPayload(input));
}

export function assertSerializedOrderIdempotencyPayloadMatches(savedPayload: string, expectedPayload: string) {
  if (savedPayload === expectedPayload) return;
  const error = new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD") as Error & { code: string; status: number };
  error.code = "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD";
  error.status = 409;
  throw error;
}
