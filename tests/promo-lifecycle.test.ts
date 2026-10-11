import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePromotion,
  validatePromotionDefinition,
  type PromotionDefinition,
  type PromotionRequestContext,
} from "@/lib/promotion-engine";
import {
  assertSerializedOrderIdempotencyPayloadMatches,
  serializeOrderIdempotencyPayload,
} from "@/lib/order-idempotency";

// P2.19 — promo reservation lifecycle at the pure seam.
//
// The RESERVED -> REDEEMED / RESERVED -> RELEASED transitions and the
// single-use / per-user usage counters live in DB-bound code
// (lib/durable-store.ts: createPendingOrder + applyProviderResult, guarded by
// the `activePromoReservationWhere` predicate and the conditional INSERT).
// D1 is unavailable in unit tests, so the state-machine below is a narrow
// in-test mirror of that SQL contract, exercised together with the REAL pure
// functions (promotion-engine + order-idempotency). Anything asserting actual
// DB rows (concurrent double-checkout races, TTL sweeps, webhook replays
// against stored orders) still needs a DB/integration harness.

type RedemptionStatus = "RESERVED" | "REDEEMED" | "RELEASED";

type RedemptionRow = {
  status: RedemptionStatus;
  userId: string;
  reservationExpiresAt: number | null;
  providerCheckoutId?: string | null;
  orderStatus?: "PAYMENT_PENDING" | "PAYMENT_FAILED" | "PAID";
};

function promo(overrides: Partial<PromotionDefinition> = {}): PromotionDefinition {
  return {
    id: "promo_test",
    code: "SAVE10",
    name: "Save 10",
    description: "Test promotion",
    discountType: "PERCENT",
    discountValue: 10,
    currency: "KZT",
    maxUsesPerUser: 1,
    maxTotalUses: 1,
    status: "ACTIVE",
    ...overrides,
  };
}

const context: PromotionRequestContext = {
  nowMs: 1_000,
  userId: "user_1",
  email: "person@example.com",
  testId: "t-skills",
  currency: "KZT",
  originalAmountMinor: 10_001,
  existingUser: false,
};

/** Mirrors `activePromoReservationWhere` (lib/durable-store.ts): a reservation
 *  with an attached provider session remains active past its local TTL until a
 *  terminal provider event changes the order/redemption state. */
function isActiveReservation(row: RedemptionRow, nowMs: number): boolean {
  if (row.status === "REDEEMED") return true;
  if (row.status === "RESERVED" && row.reservationExpiresAt !== null && row.reservationExpiresAt > nowMs) return true;
  if (row.status === "RESERVED" && row.providerCheckoutId && row.orderStatus !== "PAYMENT_FAILED") return true;
  return false;
}

/** Mirrors the conditional-INSERT usage guard (lib/durable-store.ts): a
 *  checkout is allowed only while both the global and per-user active counts
 *  stay below their configured maxima. */
function isPromoUseAllowed(input: {
  rows: readonly RedemptionRow[];
  userId: string;
  nowMs: number;
  maxTotalUses?: number | null;
  maxUsesPerUser?: number | null;
}): boolean {
  const active = input.rows.filter((row) => isActiveReservation(row, input.nowMs));
  if (input.maxTotalUses !== null && input.maxTotalUses !== undefined && active.length >= input.maxTotalUses) return false;
  if (input.maxUsesPerUser !== null && input.maxUsesPerUser !== undefined && active.filter((row) => row.userId === input.userId).length >= input.maxUsesPerUser) return false;
  return true;
}

/** Mirrors the webhook transition in `applyProviderResult`
 *  (lib/durable-store.ts): PAID redeems, PAYMENT_FAILED releases; the SQL
 *  `WHERE status = 'RESERVED'` makes every other combination a no-op so
 *  retries are idempotent. */
function nextRedemptionStatus(current: RedemptionStatus, webhookStatus: "PAID" | "PAYMENT_FAILED"): RedemptionStatus {
  if (current !== "RESERVED") return current;
  if (webhookStatus === "PAID") return "REDEEMED";
  return "RELEASED";
}

test("single-use reservation blocks a second checkout while the first is active", () => {
  const definition = promo();
  assert.equal(validatePromotionDefinition({ ...definition }).maxUsesPerUser, 1);
  const active: RedemptionRow[] = [{ status: "RESERVED", userId: "user_1", reservationExpiresAt: 2_000 }];
  assert.equal(isPromoUseAllowed({ rows: active, userId: "user_1", nowMs: 1_000, maxTotalUses: 1, maxUsesPerUser: 1 }), false);
  assert.equal(isPromoUseAllowed({ rows: active, userId: "user_2", nowMs: 1_000, maxTotalUses: 1, maxUsesPerUser: 1 }), false);
  // The pure engine is stateless: it prices the same request twice without
  // complaint, which is exactly why single-use enforcement must live in the
  // DB reservation row rather than in calculatePromotion.
  assert.equal(calculatePromotion(definition, context).finalAmountMinor, 9_001);
  assert.equal(calculatePromotion(definition, context).finalAmountMinor, 9_001);
});

test("expired reservations stop counting, so abandoned checkouts free the code", () => {
  const rows: RedemptionRow[] = [{ status: "RESERVED", userId: "user_1", reservationExpiresAt: 900 }];
  assert.equal(isActiveReservation(rows[0]!, 1_000), false);
  assert.equal(isPromoUseAllowed({ rows, userId: "user_1", nowMs: 1_000, maxTotalUses: 1, maxUsesPerUser: 1 }), true);
});

test("provider-backed reservation stays counted beyond TTL until its terminal event", () => {
  const rows: RedemptionRow[] = [{
    status: "RESERVED",
    userId: "user_1",
    reservationExpiresAt: 900,
    providerCheckoutId: "cs_async",
    orderStatus: "PAYMENT_PENDING",
  }];
  assert.equal(isActiveReservation(rows[0]!, 1_000), true);
  assert.equal(isPromoUseAllowed({ rows, userId: "user_2", nowMs: 1_000, maxTotalUses: 1 }), false);

  const paidStatus = nextRedemptionStatus(rows[0]!.status, "PAID");
  assert.equal(paidStatus, "REDEEMED");
  assert.equal(isActiveReservation({ ...rows[0]!, status: paidStatus }, 1_000), true);

  const failedStatus = nextRedemptionStatus(rows[0]!.status, "PAYMENT_FAILED");
  assert.equal(failedStatus, "RELEASED");
  assert.equal(isActiveReservation({ ...rows[0]!, status: failedStatus, orderStatus: "PAYMENT_FAILED" }, 1_000), false);
});

test("failed-payment release does not consume the per-user limit", () => {
  let status: RedemptionStatus = "RESERVED";
  status = nextRedemptionStatus(status, "PAYMENT_FAILED");
  assert.equal(status, "RELEASED");
  const rows: RedemptionRow[] = [{ status, userId: "user_1", reservationExpiresAt: 2_000 }];
  assert.equal(isActiveReservation(rows[0]!, 1_000), false);
  assert.equal(isPromoUseAllowed({ rows, userId: "user_1", nowMs: 1_000, maxTotalUses: 1, maxUsesPerUser: 1 }), true);
  // A duplicate failure webhook after release is a no-op.
  assert.equal(nextRedemptionStatus(status, "PAYMENT_FAILED"), "RELEASED");
  // A late PAID webhook for a released reservation must not resurrect it
  // (the UPDATE only touches rows still in RESERVED state).
  assert.equal(nextRedemptionStatus(status, "PAID"), "RELEASED");
});

test("successful payment redeems the reservation and consumes single use", () => {
  let status: RedemptionStatus = "RESERVED";
  status = nextRedemptionStatus(status, "PAID");
  assert.equal(status, "REDEEMED");
  const rows: RedemptionRow[] = [{ status, userId: "user_1", reservationExpiresAt: null }];
  assert.equal(isActiveReservation(rows[0]!, 1_000), true);
  assert.equal(isPromoUseAllowed({ rows, userId: "user_1", nowMs: 1_000, maxTotalUses: 1, maxUsesPerUser: 1 }), false);
  // Webhook retry after a successful redeem is idempotent.
  assert.equal(nextRedemptionStatus(status, "PAID"), "REDEEMED");
});

test("webhook retry dedupe: same idempotency key replays only with the identical payload", () => {
  const first = serializeOrderIdempotencyPayload({ testId: "t-skills", amountMinor: 9_001, currency: "kzt", provider: "stripe", promoCode: "SAVE10" });
  const retry = serializeOrderIdempotencyPayload({ testId: "t-skills", amountMinor: 9_001, currency: "KZT", provider: "stripe", promoCode: "SAVE10" });
  // Canonicalization (currency upper-casing) keeps a case-variant retry on the
  // same key a single effect: no mismatch is raised.
  assert.doesNotThrow(() => assertSerializedOrderIdempotencyPayloadMatches(first, retry));
  const tampered = serializeOrderIdempotencyPayload({ testId: "t-skills", amountMinor: 9_002, currency: "KZT", provider: "stripe", promoCode: "SAVE10" });
  assert.throws(
    () => assertSerializedOrderIdempotencyPayloadMatches(first, tampered),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" &&
      "status" in error &&
      error.status === 409,
  );
});
