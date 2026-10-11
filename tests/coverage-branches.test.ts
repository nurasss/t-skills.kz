import assert from "node:assert/strict";
import { test } from "node:test";

import { selectionFromPayload } from "@/lib/adaptive-contract";
import {
  buildDemoResponses,
  buildReport,
  normalizeScoreProfile,
  scoreAssessment,
  selectAdaptiveItems,
  validateAdaptiveSelection,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { sanitizeTelemetryMetadata } from "@/lib/analytics";
import { applySecurityHeaders, contentSecurityPolicy, createCspNonce, requestIdFrom } from "@/lib/security-headers";
import { nextPaymentStatus, paymentTelemetryEvent } from "@/lib/payment-event-policy";
import { validatePaymentSnapshot } from "@/lib/payment-integrity";
import { retentionDaysFrom } from "@/lib/retention-policy";

test("legacy normalization covers malformed and versioned snapshot branches", () => {
  const fallback = normalizeScoreProfile(null);
  assert.equal(fallback.normStatus, "unvalidated");

  const malformed = normalizeScoreProfile({
    versions: "bad",
    traits: [null, 42, { code: "T01", standardScore: "bad", percentile: "bad", profileIndex: "bad", ci95: "bad", uncertaintyRange: [0, null] }],
    domains: [null, 42, { code: null, name: null, score: "bad", percentile: 41 }],
    responseQuality: "bad",
    normStatus: "pilot",
  });
  assert.equal(malformed.normStatus, "unvalidated");
  assert.equal(malformed.traits.length, 1);
  assert.deepEqual(malformed.traits[0].uncertaintyRange, [1, 99]);
  assert.equal(malformed.domains.length, 1);

  const current = scoreAssessment(buildDemoResponses());
  const versioned = normalizeScoreProfile({
    ...current,
    normStatus: "normed",
    versions: { assessment: "a", itemBank: "i", scoring: "s", norms: "n" },
    responseQuality: { metrics: { attentionFailures: 3 } },
  });
  assert.equal(versioned.normStatus, "unvalidated");
  assert.deepEqual(
    {
      assessment: versioned.versions.assessment,
      itemBank: versioned.versions.itemBank,
      scoring: versioned.versions.scoring,
      norms: versioned.versions.norms,
    },
    { assessment: "a", itemBank: "i", scoring: "s", norms: "n" },
  );
  assert.equal(versioned.responseQuality.metrics.attentionFailures, 3);
});

test("report and adaptive fallbacks cover sparse and invalid contracts", () => {
  const profile = scoreAssessment(buildDemoResponses());
  const flagged = { ...profile, responseQuality: { ...profile.responseQuality, flags: ["ATTENTION_CHECK"] } };
  assert.match(buildReport(flagged).confidenceNote, /ATTENTION_CHECK/);

  const sparse = { ...profile, traits: profile.traits.slice(0, 2) } as ScoreProfile;
  const report = buildReport(sparse);
  assert.equal(report.combinations.length, 3);
  assert.match(report.combinations[1].text, /контекстом/);

  const selection = selectAdaptiveItems(profile, [], 12);
  const extraReason = { ...selection.reasonCodes, Q999: ["HIGH_INFORMATION"] };
  assert.equal(validateAdaptiveSelection(selection.selectedItemIds, [], 3, {}, extraReason), false);
  const missingReason = { ...selection.reasonCodes };
  delete missingReason[selection.selectedItemIds[0]];
  assert.equal(validateAdaptiveSelection(selection.selectedItemIds, [], 3, {}, missingReason), false);
  assert.equal(validateAdaptiveSelection(selection.selectedItemIds, [], 3, {}, { ...selection.reasonCodes, [selection.selectedItemIds[0]]: [] }), false);
  assert.equal(validateAdaptiveSelection(selection.selectedItemIds, [], 3, {}, { ...selection.reasonCodes, [selection.selectedItemIds[0]]: new Array(9).fill("HIGH_INFORMATION") }), false);
});

test("adaptive provider payload parser covers both reason-code encodings", () => {
  assert.deepEqual(
    selectionFromPayload({
      selected_item_ids: ["Q251"],
      target_count: 10,
      reason_codes: [{ item_id: "Q251", reasons: ["HIGH_INFORMATION"] }, null, { item_id: 2, reasons: [] }],
    }),
    { selectedItemIds: ["Q251"], targetCount: 10, reasonCodes: { Q251: ["HIGH_INFORMATION"] } },
  );
  assert.deepEqual(
    selectionFromPayload({
      selected_item_ids: ["Q251"],
      target_count: 10,
      reason_codes: { Q251: ["HIGH_INFORMATION"], Q252: "bad" },
    }),
    { selectedItemIds: ["Q251"], targetCount: 10, reasonCodes: { Q251: ["HIGH_INFORMATION"] } },
  );
  assert.throws(() => selectionFromPayload(null), /ADAPTIVE_OUTPUT_INVALID/);
  assert.throws(() => selectionFromPayload({ selected_item_ids: [1], target_count: 10 }), /ADAPTIVE_OUTPUT_INVALID/);
});

test("payment and utility branches reject every incomplete snapshot", () => {
  const validOrder = { provider: "stripe", providerCheckoutId: "cs_1", amountMinor: 150000, currency: "KZT", testId: "orbita30" };
  const validEvent = { providerCheckoutId: "cs_1", amountMinor: 150000, currency: "KZT", testId: "orbita30", paymentStatus: "paid" };
  assert.equal(validatePaymentSnapshot({ ...validOrder, provider: "other" }, validEvent), false);
  assert.equal(validatePaymentSnapshot({ ...validOrder, providerCheckoutId: null }, validEvent), false);
  assert.equal(validatePaymentSnapshot({ ...validOrder, amountMinor: 0 }, validEvent), false);
  assert.equal(validatePaymentSnapshot({ ...validOrder, currency: "" }, validEvent), false);
  assert.equal(validatePaymentSnapshot(validOrder, { ...validEvent, currency: null }), false);
  assert.equal(nextPaymentStatus("DISPUTED", "REFUNDED"), "DISPUTED");
  assert.equal(nextPaymentStatus("PAID", "PARTIALLY_REFUNDED"), "PARTIALLY_REFUNDED");
  assert.equal(nextPaymentStatus("PARTIALLY_REFUNDED", "REFUND_FAILED"), "PARTIALLY_REFUNDED");
  assert.equal(paymentTelemetryEvent("PARTIALLY_REFUNDED"), "payment_partially_refunded");
  assert.equal(nextPaymentStatus("PAID", "DISPUTE_CLOSED"), "PAID");
  assert.equal(paymentTelemetryEvent("PAID"), "payment_confirmed");
  assert.equal(paymentTelemetryEvent("PAYMENT_FAILED"), null);
  assert.equal(paymentTelemetryEvent("REFUNDED"), "payment_refunded");
  assert.equal(paymentTelemetryEvent("DISPUTED"), "payment_disputed");
  assert.equal(paymentTelemetryEvent("DISPUTE_CLOSED"), "payment_dispute_closed");

  assert.equal(retentionDaysFrom("bad"), 365);
  assert.deepEqual(sanitizeTelemetryMetadata(null as unknown as Record<string, unknown>), {});
  assert.deepEqual(sanitizeTelemetryMetadata({ count: Number.NaN, status: true, latency_ms: 1.5 }), { status: true, latency_ms: 1.5 });
  const invalidRequestId = requestIdFrom(new Request("https://orbita.test", { headers: { "X-Request-ID": "bad id" } }));
  assert.notEqual(invalidRequestId, "bad id");
  assert.equal(requestIdFrom(new Request("https://orbita.test", { headers: { "X-Request-ID": "req_valid" } })), "req_valid");

  const nonce = createCspNonce();
  assert.match(nonce, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(contentSecurityPolicy().includes("nonce-"), false);
  const noncePolicy = contentSecurityPolicy(nonce).split(";").find((directive) => directive.trim().startsWith("script-src "))?.trim() ?? "";
  assert.match(noncePolicy, /^script-src 'self' 'nonce-[A-Za-z0-9+/]+={0,2}'$/);
  const secured = applySecurityHeaders(
    new Response("ok", { headers: { "X-Frame-Options": "SAMEORIGIN" } }),
    "req_nonce",
    nonce,
  );
  assert.equal(secured.headers.get("X-Frame-Options"), "SAMEORIGIN");
  assert.match(secured.headers.get("Content-Security-Policy") ?? "", /nonce-/);
});
