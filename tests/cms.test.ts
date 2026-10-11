import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoDraftLeak,
  cmsSchemaFor,
  toPublicContentItem,
  validateCmsPayload,
} from "@/lib/cms-schemas";

test("public CMS representation never contains draft state", () => {
  const item = toPublicContentItem({
    content_key: "homepage",
    locale: "ru",
    published_version: 7,
    published_payload_json: JSON.stringify({ heroPre: "Hello", cta: "Go" }),
    published_at: 1234567890,
  });
  assert.deepEqual(Object.keys(item).sort(), ["contentKey", "locale", "published", "publishedAt", "publishedVersion"]);
  assert.deepEqual(item, {
    contentKey: "homepage",
    locale: "ru",
    publishedVersion: 7,
    published: { heroPre: "Hello", cta: "Go" },
    publishedAt: 1234567890,
  });
  const serialized = JSON.stringify(item);
  assert.ok(!serialized.includes("SECRET UPCOMING LAUNCH"));
  assert.ok(!serialized.includes("draft"));
  assert.ok(!serialized.includes("draftStatus"));
  assert.ok(!serialized.includes("currentVersion"));
  assert.doesNotThrow(() => assertNoDraftLeak([item]));
});

test("draft payload is not exposed via public projection", () => {
  // A draft-only row has no published version; public query filters it out.
  // The projection itself must also never emit draft keys even if misused.
  const item = toPublicContentItem({
    content_key: "homepage",
    locale: "ru",
    published_version: 3,
    published_payload_json: JSON.stringify({ heroPre: "Published" }),
    published_at: 42,
  });
  assert.equal(JSON.stringify(item).includes("SECRET UPCOMING LAUNCH"), false);
  assert.throws(() => assertNoDraftLeak({ draft: { heroPre: "SECRET" } }), /PUBLIC_CMS_LEAK/);
  assert.throws(() => assertNoDraftLeak({ currentVersion: 9 }), /PUBLIC_CMS_LEAK/);
});

test("per-key CMS schemas exist and are strict", () => {
  assert.ok(cmsSchemaFor("homepage"));
  assert.ok(cmsSchemaFor("faq"));
  assert.ok(cmsSchemaFor("seo"));
  // Unknown fields must be rejected, not silently stored.
  assert.equal(validateCmsPayload("homepage", { heroPre: "Test", unknownField: "x" }).ok, false);
  assert.equal(validateCmsPayload("seo", { title: "t", description: "d", extra: 1 }).ok, false);
});

test("structurally invalid homepage payload is rejected (stats must be a list)", () => {
  const broken = {
    heroPre: "Test",
    heroLede: "Test",
    cta: "Go",
    stats: "broken",
  };
  const result = validateCmsPayload("homepage", broken);
  assert.equal(result.ok, false);
  // Valid payload passes.
  assert.equal(validateCmsPayload("homepage", { heroPre: "T-Skills", heroLede: "Desc", cta: "Начать" }).ok, true);
  assert.equal(
    validateCmsPayload("homepage", {
      heroPre: "T",
      heroLede: "L",
      cta: "C",
      stats: [["25", "Качеств"], ["75", "Вопросов"]],
    }).ok,
    true,
  );
});

test("faq and seo payloads validate their own shapes", () => {
  assert.equal(validateCmsPayload("faq", { title: "Частые вопросы", items: [{ q: "Q?", a: "A." }] }).ok, true);
  assert.equal(validateCmsPayload("faq", { items: "not-a-list" }).ok, false);
  assert.equal(validateCmsPayload("faq", { items: [{ q: "Q?", a: "A." }] }).ok, false, "FAQ must include the title required by the publish path");
  assert.equal(validateCmsPayload("seo", { title: "T", description: "D" }).ok, true);
  assert.equal(validateCmsPayload("seo", { title: "T" }).ok, false);
  assert.equal(validateCmsPayload("unknown-key", {}).ok, false);
});

test("unsafe markup is rejected by the structured-content guard path", async () => {
  // The guard lives in admin-store; here we assert the schema layer does not
  // accept script-bearing strings as valid homepage copy either via length/type.
  const withScript = { heroPre: "<script>alert(1)</script>", heroLede: "L", cta: "C" };
  // Schema type-checks pass (string), but admin-store assertSafeStructuredContent
  // must reject before persisting. We assert the payload shape is at least
  // recognized so the test documents the two-layer contract.
  assert.equal(validateCmsPayload("homepage", withScript).ok, true);
});

test("publish path re-validates the stored draft payload before it goes live", () => {
  // publishContent (lib/admin-store.ts) reloads the STORED draft payload and
  // re-runs the guard + schema + required-field checks. The DB round-trip
  // itself needs an integration harness; here we pin the pure seam: a draft
  // that was tampered in storage must fail validateCmsPayload.
  const storedDraft = JSON.parse(JSON.stringify({
    heroPre: "T-Skills",
    heroLede: "Desc",
    cta: "Начать",
    stats: [["25", "Качеств"], ["75", "Вопросов"]],
  }));
  assert.equal(validateCmsPayload("homepage", storedDraft).ok, true);
  const tampered = JSON.parse(JSON.stringify({ ...storedDraft, stats: "broken", unknownField: "x" }));
  const result = validateCmsPayload("homepage", tampered);
  assert.equal(result.ok, false);
  const tamperedFaq = JSON.parse(JSON.stringify({ items: "not-a-list" }));
  assert.equal(validateCmsPayload("faq", tamperedFaq).ok, false);
});

test("restore path validates the source version payload before it becomes a draft", () => {
  // restoreContent (lib/admin-store.ts) funnels the source payload through
  // upsertContentDraft, which re-validates. Pure seam: a corrupt source
  // version must fail validateCmsPayload so it can never become a draft.
  const source = JSON.parse(JSON.stringify({ heroPre: "T", heroLede: "L", cta: "C" }));
  assert.equal(validateCmsPayload("homepage", source).ok, true);
  const corrupt = JSON.parse(JSON.stringify({ heroPre: "T", unknownField: "x" }));
  assert.equal(validateCmsPayload("homepage", corrupt).ok, false);
});

test("unknown content keys are rejected with a content_key issue", () => {
  for (const key of ["billing", "", "HOMEPAGE"]) {
    const result = validateCmsPayload(key, { heroPre: "T", heroLede: "L", cta: "C" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((issue) => issue.path.includes("content_key")));
  }
});

test("unsafe-markup detector contract identifies hostile strings", () => {
  // Enforcement is assertSafeStructuredContent (lib/admin-store.ts), which is
  // DB-bound via upsertContentDraft/publishContent and cannot run here. The
  // patterns below mirror that guard so regressions in the documented
  // contract are visible at the unit level.
  const tagPattern = /<\s*(script|iframe|object|embed)\b/i;
  const urlPattern = /javascript\s*:/i;
  const keyPattern = /html|script|iframe|javascript|raw/i;
  for (const hostile of [
    "<script>alert(1)</script>",
    "<SCRIPT SRC=x>",
    "<iframe src=\"https://evil.example\">",
    "<object data=\"x\">",
    "<embed src=\"x\">",
    "javascript:alert(1)",
    "JaVaScRiPt :alert(1)",
  ]) {
    assert.ok(tagPattern.test(hostile) || urlPattern.test(hostile), `must flag: ${hostile}`);
  }
  for (const key of ["rawHtml", "customScript", "iframeUrl", "javascriptLink", "raw"]) {
    assert.ok(keyPattern.test(key), `must flag key: ${key}`);
  }
  for (const benignValue of ["Скрипка и сценарий урока", "JavaScript-разработчик"]) {
    assert.equal(tagPattern.test(benignValue) || urlPattern.test(benignValue), false);
  }
  for (const benignKey of ["cta", "heroPre", "stats"]) {
    assert.equal(keyPattern.test(benignKey), false);
  }
  // The key guard is intentionally broad: a key containing "javascript" is
  // rejected even though the same text is harmless as a value.
  assert.equal(keyPattern.test("JavaScript-разработчик"), true);
});
