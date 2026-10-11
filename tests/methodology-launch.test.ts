import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { METHOD_STRINGS } from "@/lib/site-strings";

const INTERNAL = /launch|чек-лист|чеклист|TODO|FIXME|TBD|normStatus|raw responses|score JSON|Mercury|EFA|CFA|DIF|Q243|snapshot|frozen|≈|production|review\b.*юридическое/i;

function methodTexts(lang: "ru" | "kk"): string[] {
  const t = METHOD_STRINGS[lang];
  return [
    t.body,
    t.b1b, t.b2b, t.b3b, t.b3pre, t.b4b, t.b5t, t.b6b,
    t.normWarn,
    ...t.formula.flat(),
    ...t.quality.flat(),
    ...t.validation,
    t.adStatic, t.adStaticV, t.adGoalV(8), t.adFormatV, t.adScoring, t.adScoringV,
  ];
}

test("methodology page has no internal launch notes in either language", () => {
  for (const lang of ["ru", "kk"] as const) {
    const hits = methodTexts(lang).filter((text) => INTERNAL.test(text));
    assert.deepEqual(hits, [], `${lang} must not contain internal wording`);
  }
  const view = readFileSync("app/views/methodology/methodology-view.tsx", "utf-8");
  assert.ok(!view.includes(">frozen<"));
});

test("methodology keeps a coherent user explanation and substantive limits", () => {
  for (const lang of ["ru", "kk"] as const) {
    const t = METHOD_STRINGS[lang];
    assert.equal(t.validation.length, 6);
    assert.ok(t.quality.length >= 4);
    assert.ok(t.formula.length === 3);
    // Questions, calculation and interpretation stay explained.
    assert.ok(t.b1b.length > 0 && t.b2b.length > 0 && t.b3b.length > 0);
    // Substantive limitations stay: third-party marks, pilot status, no clinical/hiring use.
    assert.ok(/Gallup/i.test(t.b6b));
    assert.ok(t.b6b.length > 100);
  }
  assert.ok(/клиническ|найм/i.test(METHOD_STRINGS.ru.b6b));
  assert.ok(/диагноз|жұмысқа қабылдау/i.test(METHOD_STRINGS.kk.b6b));
});
