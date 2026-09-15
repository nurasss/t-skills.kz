import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDemoResponses, scoreAssessment, validateAdaptiveSelection } from "@/lib/assessment-engine";
import { canSessionTransition } from "@/lib/assessment-state-machine";
import { resourceBelongsToViewer } from "@/lib/ownership-policy";
import { nextPaymentStatus } from "@/lib/payment-event-policy";
import { validatePaymentSnapshot } from "@/lib/payment-integrity";
import { validatePdfGrantClaims } from "@/lib/pdf-token-policy";
import { verifyStripeSignature } from "@/lib/stripe-signature";

test("fault vectors kill payment amount and monotonic-state mutations", () => {
  const order = { provider: "stripe", providerCheckoutId: "cs_1", amountMinor: 150000, currency: "KZT", testId: "orbita30" };
  const wrongAmount = { providerCheckoutId: "cs_1", amountMinor: 150001, currency: "KZT", testId: "orbita30", paymentStatus: "paid" };
  assert.equal(validatePaymentSnapshot(order, wrongAmount), false);
  assert.equal(nextPaymentStatus("REFUNDED", "PAID"), "REFUNDED");
});

test("fault vectors kill owner and PDF-expiry bypass mutations", () => {
  assert.equal(resourceBelongsToViewer("user_a", "user_b"), false);
  assert.equal(resourceBelongsToViewer("user_a", "user_a"), true);
  assert.equal(validatePdfGrantClaims({ reportId: "rep", userId: "user_a", expiresAt: 100 }, 100), null);
  assert.equal(validatePdfGrantClaims(null, 99), null);
  assert.equal(validatePdfGrantClaims({ reportId: "", userId: "user_a", expiresAt: 100 }, 99), null);
  assert.equal(validatePdfGrantClaims({ reportId: "rep", userId: "user_a", expiresAt: 100.5 }, 99), null);
});

test("fault vectors kill score direction and adaptive quota mutations", () => {
  const demo = buildDemoResponses();
  const profile = scoreAssessment(demo);
  assert.equal(profile.normStatus, "unvalidated");
  assert.equal(validateAdaptiveSelection(["Q251", "Q281", "Q282", "Q283", "Q284", "Q285", "Q286", "Q287", "Q288", "Q289"], [], 2), false);
  assert.equal(canSessionTransition("COMPLETE", "CORE_IN_PROGRESS"), false);
});

test("fault vector kills unsigned or tampered webhook acceptance", async () => {
  const now = Date.now();
  assert.equal(await verifyStripeSignature('{"id":"evt"}', "", "whsec_test", now), false);
  assert.equal(await verifyStripeSignature('{"id":"evt"}', "t=1,v1=deadbeef", "whsec_test", now), false);
});
