import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADAPTIVE_REASON_CODES,
  buildDemoResponses,
  buildReport,
  itemCountSummary,
  normalizeScoreProfile,
  scoreAssessment,
  selectAdaptiveItems,
  validateAdaptiveSelection,
} from "@/lib/assessment-engine";
import { ITEM_BANK } from "@/lib/item-bank";
import { INTERPRETATION_LIBRARY_VERSION } from "@/lib/interpretation-library";
import { sanitizeTelemetryMetadata } from "@/lib/analytics";
import { validatePaymentSnapshot } from "@/lib/payment-integrity";
import { verifyStripeSignature } from "@/lib/stripe-signature";
import { canPublishLocale, itemTranslationMetadata, resolveLocale } from "@/lib/i18n";
import { isRetentionCandidate, retentionDaysFrom, RETENTION_ACTIVE_STATES } from "@/lib/retention-policy";

test("item bank and taxonomy remain the complete 300-item Russian source", () => {
  assert.deepEqual(itemCountSummary(), { total: 300, forced: 150, likert: 90, quality: 10, adaptiveDirect: 30, adaptiveForced: 20 });
  assert.equal(new Set(ITEM_BANK.map((item) => item.id)).size, 300);
});

test("scoring is deterministic, norm-safe, and keeps reverse/Likert and forced-choice directions", () => {
  const demo = buildDemoResponses();
  assert.deepEqual(scoreAssessment(demo), scoreAssessment(demo));
  const profile = scoreAssessment(demo);
  assert.equal(profile.normStatus, "unvalidated");
  assert.equal(profile.versions.scoring, "mvp-0.4-norm-safe");
  assert.equal(profile.versions.norms, "pilot-index-unvalidated-v1");
  assert.ok(profile.traits.every((trait) => "profileIndex" in trait && "uncertaintyRange" in trait && !("percentile" in trait)));
  assert.ok(profile.domains.every((domain) => "profileIndex" in domain && !("percentile" in domain)));

  const reverse = ITEM_BANK.find((item) => item.type === "likert" && item.reverse);
  assert.ok(reverse && reverse.type === "likert");
  const highReverse = scoreAssessment({ [reverse.id]: 7 });
  const lowReverse = scoreAssessment({ [reverse.id]: 1 });
  assert.ok((highReverse.traits.find((trait) => trait.code === reverse.trait)?.theta ?? 0) < (lowReverse.traits.find((trait) => trait.code === reverse.trait)?.theta ?? 0));

  const forced = ITEM_BANK.find((item) => item.type === "forced");
  assert.ok(forced && forced.type === "forced");
  const forcedProfile = scoreAssessment({ [forced.id]: 2 });
  assert.ok((forcedProfile.traits.find((trait) => trait.code === forced.rightTrait)?.theta ?? 0) > (forcedProfile.traits.find((trait) => trait.code === forced.leftTrait)?.theta ?? 0));
});

test("legacy score snapshots normalize to the new public contract", () => {
  const current = scoreAssessment(buildDemoResponses());
  const legacy = {
    ...current,
    normStatus: undefined,
    traits: current.traits.map((trait) => {
      const { profileIndex, uncertaintyRange, ...rest } = trait;
      return { ...rest, percentile: profileIndex, ci95: uncertaintyRange };
    }),
    domains: current.domains.map((domain) => {
      const { profileIndex, ...rest } = domain;
      return { ...rest, percentile: profileIndex };
    }),
  };
  const normalized = normalizeScoreProfile(legacy);
  assert.equal(normalized.normStatus, "unvalidated");
  assert.ok(normalized.traits.every((trait) => !("percentile" in trait) && !("ci95" in trait)));
  assert.ok(normalized.domains.every((domain) => !("percentile" in domain)));
});

test("quality checks use modal straight-line detection, exploratory speed flags, and handle research-only markers", () => {
  const likertIds = ITEM_BANK.filter((item) => item.type === "likert").map((item) => item.id);
  const modalResponses = Object.fromEntries(likertIds.map((id, index) => [id, index === 0 ? 1 : 4]));
  const modalProfile = scoreAssessment(modalResponses);
  assert.ok(modalProfile.responseQuality.flags.includes("STRAIGHT_LINING"));

  const fastResponses = buildDemoResponses();
  const fastTimes = Object.fromEntries(ITEM_BANK.slice(0, 25).map((item) => [item.id, 100]));
  const fastProfile = scoreAssessment(fastResponses, fastTimes);
  assert.ok(fastProfile.responseQuality.flags.includes("TOO_FAST"));
  assert.deepEqual(fastProfile.responseQuality.metrics.researchOnlyItemIds, ["Q243", "Q246", "Q249", "Q250"]);
  assert.equal(fastProfile.responseQuality.metrics.consistencyMarkerCoverage, 1);
  assert.equal(fastProfile.responseQuality.metrics.consistencyMarkers.Q250, 0.67);
});

test("adaptive selection is bounded, reason-coded, quota-safe, and duplicate-safe", () => {
  const profile = scoreAssessment(buildDemoResponses());
  const answered = ITEM_BANK.filter((item) => Number(item.id.slice(1)) <= 250).map((item) => item.id);
  const selection = selectAdaptiveItems(profile, answered, 12);
  assert.equal(selection.selectedItemIds.length, 12);
  assert.equal(new Set(selection.selectedItemIds).size, 12);
  assert.ok(validateAdaptiveSelection(selection.selectedItemIds, answered, 3, {}, selection.reasonCodes));
  assert.ok(Object.values(selection.reasonCodes).flat().every((reason) => ADAPTIVE_REASON_CODES.includes(reason)));
  assert.equal(selection.selectedItemIds.some((id) => new Set<string>(answered).has(id)), false);

  const clusters = Object.fromEntries(selection.selectedItemIds.map((id) => [id, "same-cluster"]));
  assert.equal(validateAdaptiveSelection(selection.selectedItemIds, answered, 3, clusters, selection.reasonCodes), false);
  const invalidReasons = Object.fromEntries(selection.selectedItemIds.map((id, index) => [id, index === 0 ? ["NOT_A_REASON"] : ["HIGH_INFORMATION"]]));
  assert.equal(validateAdaptiveSelection(selection.selectedItemIds, answered, 3, {}, invalidReasons), false);
});

test("approved report contract contains required styles and versioned semantics", () => {
  const profile = scoreAssessment(buildDemoResponses());
  const report = buildReport(profile);
  assert.equal(report.interpretationLibraryVersion, INTERPRETATION_LIBRARY_VERSION);
  assert.equal(report.topStrengths.length, 5);
  assert.equal(report.combinations.length, 3);
  assert.ok(report.thinkingStyle && report.executionStyle && report.influenceStyle && report.collaborationStyle && report.selfManagementStyle && report.communicationStyle && report.stressAndBlindSpots);
  assert.match(report.confidenceNote, /пилотный индекс|индекс профиля/i);
});

test("payment integrity requires exact order/event snapshot", () => {
  const order = { provider: "stripe", providerCheckoutId: "cs_test_123", amountMinor: 150000, currency: "KZT", testId: "orbita30" };
  const event = { providerCheckoutId: "cs_test_123", amountMinor: 150000, currency: "kzt", testId: "orbita30", paymentStatus: "paid" };
  assert.equal(validatePaymentSnapshot(order, event), true);
  assert.equal(validatePaymentSnapshot(order, { ...event, amountMinor: 149000 }), false);
  assert.equal(validatePaymentSnapshot(order, { ...event, providerCheckoutId: "cs_other" }), false);
  assert.equal(validatePaymentSnapshot(order, { ...event, paymentStatus: "unpaid" }), false);
  assert.equal(validatePaymentSnapshot(order, { ...event, testId: "other" }), false);
});

test("Stripe signature verification rejects tampering and expired timestamps", async () => {
  const payload = JSON.stringify({ id: "evt_test" });
  const secret = "whsec_test";
  const now = Date.now();
  const timestamp = Math.floor(now / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  const digest = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const signature = `t=${timestamp},v1=${digest}`;
  assert.equal(await verifyStripeSignature(payload, signature, secret, now), true);
  assert.equal(await verifyStripeSignature(`${payload}.`, signature, secret, now), false);
  assert.equal(await verifyStripeSignature(payload, `t=${timestamp - 301},v1=${digest}`, secret, now), false);
});

test("privacy-safe analytics, localization, and retention policies are explicit", () => {
  assert.deepEqual(sanitizeTelemetryMetadata({ provider: "stripe", latency_ms: 120, raw_answer: 7, email: "x@y.test", bad: "anything" }), { provider: "stripe", latency_ms: 120 });
  assert.equal(resolveLocale("EN"), "en");
  assert.equal(resolveLocale("kk"), "ru");
  assert.equal(canPublishLocale("ru"), true);
  assert.equal(canPublishLocale("kz"), false);
  assert.ok(itemTranslationMetadata("en").requirements.includes("back-translation"));
  assert.ok(RETENTION_ACTIVE_STATES.includes("ADAPTIVE_IN_PROGRESS"));
  assert.equal(isRetentionCandidate("COMPLETE", 10, 20), true);
  assert.equal(isRetentionCandidate("COMPLETE", 20, 20), false);
  assert.equal(isRetentionCandidate("CORE_IN_PROGRESS", 10, 20), false);
  assert.equal(retentionDaysFrom("1"), 30);
  assert.equal(retentionDaysFrom("99999"), 3650);
});
