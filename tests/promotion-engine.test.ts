import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePromotion,
  normalizePromoCode,
  validatePromotionDefinition,
  type PromotionDefinition,
} from "@/lib/promotion-engine";
import { assertSerializedOrderIdempotencyPayloadMatches, serializeOrderIdempotencyPayload } from "@/lib/order-idempotency";

function promo(overrides: Partial<PromotionDefinition> = {}): PromotionDefinition {
  return {
    id: "promo_test",
    code: "SAVE10",
    name: "Save 10",
    description: "Test promotion",
    discountType: "PERCENT",
    discountValue: 10,
    currency: "KZT",
    status: "ACTIVE",
    ...overrides,
  };
}

const context = {
  nowMs: 1_000,
  userId: "user_1",
  email: "person@example.com",
  testId: "t-skills",
  currency: "KZT",
  originalAmountMinor: 10_001,
  existingUser: false,
};

test("promotion engine supports percent, fixed, free access and never produces a negative price", () => {
  assert.deepEqual(calculatePromotion(promo(), context), {
    originalAmountMinor: 10_001,
    discountAmountMinor: 1_000,
    finalAmountMinor: 9_001,
    freeAccess: false,
  });
  assert.equal(calculatePromotion(promo({ discountType: "FIXED_AMOUNT", discountValue: 99_999 }), context).finalAmountMinor, 0);
  assert.equal(calculatePromotion(promo({ discountType: "FREE_ACCESS", discountValue: 0 }), context).freeAccess, true);
  assert.equal(calculatePromotion(promo({ discountType: "FIXED_AMOUNT", discountValue: 99_999 }), context).discountAmountMinor, 10_001);
});

test("promotion engine enforces status, dates, currency, test, identity and usage policy inputs", () => {
  assert.throws(() => calculatePromotion(promo({ status: "DISABLED" }), context), /PROMO_DISABLED/);
  assert.throws(() => calculatePromotion(promo({ validFrom: 2_000 }), context), /PROMO_NOT_STARTED/);
  assert.throws(() => calculatePromotion(promo({ validUntil: 1_000 }), context), /PROMO_EXPIRED/);
  assert.throws(() => calculatePromotion(promo({ currency: "USD" }), context), /PROMO_CURRENCY_MISMATCH/);
  assert.throws(() => calculatePromotion(promo({ allowedTestIds: ["other"] }), context), /PROMO_TEST_NOT_ALLOWED/);
  assert.throws(() => calculatePromotion(promo({ newUsersOnly: true }), { ...context, existingUser: true }), /PROMO_NEW_USERS_ONLY/);
  assert.throws(() => calculatePromotion(promo({ allowedUserIds: ["other"] }), context), /PROMO_USER_NOT_ALLOWED/);
  assert.throws(() => calculatePromotion(promo({ allowedEmailDomains: ["school.edu"] }), context), /PROMO_EMAIL_DOMAIN_NOT_ALLOWED/);
  assert.throws(() => calculatePromotion(promo({ minimumOrderAmount: 20_000 }), context), /PROMO_MINIMUM_NOT_MET/);
});

test("promotion definition validation normalizes codes and rejects unsafe definitions", () => {
  assert.equal(normalizePromoCode("  save10 "), "SAVE10");
  const normalized = validatePromotionDefinition({ ...promo(), code: " save10 " });
  assert.equal(normalized.code, "SAVE10");
  assert.throws(() => validatePromotionDefinition({ ...promo(), code: "no" }), /PROMO_CODE_INVALID/);
  assert.throws(() => validatePromotionDefinition({ ...promo(), discountType: "PERCENT", discountValue: 101 }), /PROMO_PERCENT_OUT_OF_RANGE/);
  assert.throws(() => validatePromotionDefinition({ ...promo(), discountType: "FIXED_AMOUNT", discountValue: 0 }), /PROMO_FIXED_AMOUNT_INVALID/);
  assert.throws(() => validatePromotionDefinition({ ...promo(), validFrom: 20, validUntil: 10 }), /PROMO_DATE_RANGE_INVALID/);
});

test("order idempotency compares the canonical payload and returns the required 409 code", () => {
  const same = serializeOrderIdempotencyPayload({ testId: "t-skills", amountMinor: 15_000, currency: "kzt", provider: "stripe", promoCode: "SAVE10" });
  assert.doesNotThrow(() => assertSerializedOrderIdempotencyPayloadMatches(same, same));
  assert.throws(
    () => assertSerializedOrderIdempotencyPayloadMatches(same, serializeOrderIdempotencyPayload({ testId: "t-skills", amountMinor: 14_000, currency: "KZT", provider: "stripe", promoCode: "SAVE10" })),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" && "status" in error && error.status === 409,
  );
});
