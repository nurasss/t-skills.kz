import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CHECKOUT_STRINGS } from "@/lib/site-strings";

const BETA = /бета|beta/i;

function checkoutTexts(lang: "ru" | "kk"): string[] {
  const t = CHECKOUT_STRINGS[lang];
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) walk(item);
    }
  };
  walk(t);
  out.push(t.tToPay("1000"));
  return out;
}

test("promo page shows no beta-testing info in either language", () => {
  for (const lang of ["ru", "kk"] as const) {
    const hits = checkoutTexts(lang).filter((text) => BETA.test(text));
    assert.deepEqual(hits, [], `${lang} checkout copy must not mention beta`);
  }
  const view = readFileSync("app/views/checkout/checkout-view.tsx", "utf-8");
  // Only internal dictionary keys (t.eBeta etc.) and the access-mode flag may
  // contain "beta" — no user-visible string may.
  const scrubbed = view
    .replace(/\bbetaFree\b/g, "")
    .replace(/\.[A-Za-z0-9]*[Bb]eta[A-Za-z]*/g, "")
    .replace(/\bApiClientError\b/g, "")
    .replace(/"beta-free"/g, "");
  assert.ok(!BETA.test(scrubbed));
});

test("promo input, validation, errors, price and access logic stay intact", () => {
  for (const lang of ["ru", "kk"] as const) {
    const t = CHECKOUT_STRINGS[lang];
    assert.ok(t.promoLabel.length > 0);
    assert.ok(t.promoPlaceholder.length > 0);
    assert.ok(t.promoHelp.length > 0);
    assert.ok(t.promoApply.length > 0);
    assert.ok(t.promoApplied.length > 0);
  }
  const view = readFileSync("app/views/checkout/checkout-view.tsx", "utf-8");
  // Promo input + server validation wiring.
  assert.ok(view.includes('id="checkout-promo-code"'));
  assert.ok(view.includes("/api/checkout/validate-promo"));
  assert.ok(view.includes("promoStatus"));
  // Price rendering.
  assert.ok(view.includes("Intl.NumberFormat"));
  assert.ok(view.includes("displayedPrice"));
  // Access logic untouched: invite-free branch still drives the CTA.
  assert.ok(view.includes('accessMode === "beta-free"'));
  assert.ok(view.includes("promoStatus?.freeAccess"));
});
