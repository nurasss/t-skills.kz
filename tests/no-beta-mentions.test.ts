import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as STRINGS from "@/lib/site-strings";
import { LANDING_KK, LANDING_QUALITIES_KK } from "@/app/landing/content-kk";
import { LANDING_QUALITIES_RU, LANDING_RU } from "@/app/landing/content";

const BETA = /бета|beta/i;

function visibleStrings(value: unknown, out: string[]): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) visibleStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) visibleStrings(item, out);
  }
  return out;
}

test("public UI has no beta mentions in either language", () => {
  const texts: string[] = [];
  for (const [name, dict] of Object.entries(STRINGS)) {
    if (name.endsWith("STRINGS")) visibleStrings(dict, texts);
  }
  visibleStrings([LANDING_RU, LANDING_KK, LANDING_QUALITIES_RU, LANDING_QUALITIES_KK], texts);
  assert.ok(texts.length > 100, "string scan must cover the dictionaries");
  const hits = texts.filter((text) => BETA.test(text));
  assert.deepEqual(hits, []);
});

test("invite-only access strings keep their meaning without the beta word", () => {
  assert.equal(STRINGS.CHECKOUT_STRINGS.ru.eBeta, "Бесплатный доступ");
  assert.equal(STRINGS.CHECKOUT_STRINGS.kk.eBeta, "Тегін қолжетімділік");
  assert.ok(STRINGS.ACCOUNT_STRINGS.ru.betaDesc.includes("по приглашению"));
  assert.ok(STRINGS.ACCOUNT_STRINGS.ru.betaStart.includes("по приглашению"));
  assert.ok(STRINGS.EMAIL_STRINGS.ru.inviteText.includes("бесплатно"));
  assert.ok(STRINGS.EMAIL_STRINGS.kk.inviteText.includes("тегін"));
});

test("user-facing payments-disabled error has no beta mention", () => {
  const source = readFileSync("lib/api-response.ts", "utf-8");
  const line = source.split("\n").find((entry) => entry.includes("PAYMENTS_DISABLED"));
  assert.ok(line);
  assert.ok(!BETA.test(line));
});
