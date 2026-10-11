import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MOCK_TOP5 } from "@/app/landing/content";
import { MOCK_TOP5_KK } from "@/app/landing/content-kk";
import { T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import {
  DOMAIN_CODES,
  domainName,
  domainOfTraitId,
  FALLBACK_COLOR_KEY,
  fallbackDomainHex,
  taxonomyForAssessmentVersion,
  traitDomainColorKey,
  traitDomainHex,
} from "@/lib/trait-domains";
import { TEEN_TRAIT_IDS } from "@/lib/t-skills/teen/taxonomy";
import { T_SKILLS_TEEN_V3_VERSION_IDS, T_SKILLS_TEEN_VERSION_IDS, T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import { V2_DOMAINS } from "@/lib/v2-item-bank";

/** Утверждённая группировка из ТЗ: номер 01–25 → домен. */
const APPROVED: Record<string, string> = {
  analytical: "D1",
  strategic: "D1",
  curiosity: "D1",
  observation: "D1",
  "systems-thinking": "D1",
  creativity: "D2",
  adaptability: "D2",
  "risk-tolerance": "D2",
  learning: "D2",
  practicality: "D2",
  discipline: "D3",
  "attention-to-detail": "D3",
  organization: "D3",
  planning: "D3",
  leadership: "D4",
  initiative: "D4",
  persuasion: "D4",
  decisiveness: "D4",
  communication: "D5",
  empathy: "D5",
  teamwork: "D5",
  independence: "D6",
  persistence: "D6",
  responsibility: "D6",
  "stress-resilience": "D6",
};

test("approved grouping covers exactly the 25 working-taxonomy traits", () => {
  const taxonomyIds = T_SKILLS_WORKING_TAXONOMY.map((trait) => trait.id);
  assert.equal(taxonomyIds.length, 25);
  assert.deepEqual(new Set(Object.keys(APPROVED)), new Set(taxonomyIds));
  for (const id of taxonomyIds) {
    assert.equal(domainOfTraitId(id, "adult"), APPROVED[id]);
  }
});

test("one domain means one color; colors come from the existing palette", () => {
  const byDomain = new Map<string, Set<string>>();
  const hexByDomain = new Map<string, Set<string>>();
  for (const [id, domain] of Object.entries(APPROVED)) {
    const key = traitDomainColorKey(id, "adult");
    assert.notEqual(key, FALLBACK_COLOR_KEY);
    if (!byDomain.has(domain)) {
      byDomain.set(domain, new Set());
      hexByDomain.set(domain, new Set());
    }
    byDomain.get(domain)!.add(key);
    hexByDomain.get(domain)!.add(traitDomainHex(id, "adult"));
  }
  assert.equal(byDomain.size, 6);
  for (const [domain, keys] of byDomain) {
    assert.equal(keys.size, 1, `${domain} must have a single color`);
    assert.equal(hexByDomain.get(domain)!.size, 1, `${domain} must have a single hex`);
  }
  assert.deepEqual(
    [...byDomain.values()].map((keys) => [...keys][0]).sort(),
    ["amber", "blue", "coral", "lavender", "rose", "sage"],
  );
  assert.deepEqual(DOMAIN_CODES, ["D1", "D2", "D3", "D4", "D5", "D6"]);
  assert.equal(domainName("D1"), "Осмысление и анализ");
});

test("color depends on stable id plus taxonomy context, never on position, rank or language", () => {
  assert.equal(traitDomainColorKey("analytical", "adult"), traitDomainColorKey("analytical", "adult"));
  assert.equal(traitDomainHex("analytical", "adult"), "#8FA888");
  assert.equal(traitDomainColorKey("systems-thinking", "adult"), "sage");
  // Legacy codes follow the same D1–D6 domains.
  const legacy = Object.fromEntries(
    V2_DOMAINS.flatMap((domain) => (domain.traits as readonly string[]).map((code) => [code, domain.code])),
  );
  assert.equal(Object.keys(legacy).length, 30);
  for (const [code, domain] of Object.entries(legacy)) {
    assert.equal(domainOfTraitId(code, "legacy"), domain);
  }
  assert.equal(traitDomainColorKey("T01", "legacy"), "sage");
  assert.equal(traitDomainColorKey("T28", "legacy"), "lavender");
  // Unknown ids always fall back, in every taxonomy.
  for (const taxonomy of ["adult", "teen", "legacy"] as const) {
    assert.equal(domainOfTraitId("no-such-trait", taxonomy), null);
    assert.equal(traitDomainColorKey("no-such-trait", taxonomy), FALLBACK_COLOR_KEY);
  }
  assert.equal(traitDomainHex("no-such-trait", "adult"), fallbackDomainHex());
});

test("shared ids resolve per taxonomy, never by cross-table priority", () => {
  // persistence: взрослая утверждённая таблица — D6, Teen-таблица — D3.
  assert.equal(domainOfTraitId("persistence", "adult"), "D6");
  assert.equal(traitDomainColorKey("persistence", "adult"), "lavender");
  assert.equal(domainOfTraitId("persistence", "teen"), "D3");
  assert.equal(traitDomainColorKey("persistence", "teen"), "amber");
});

test("approved teen grouping distributes all 25 qualities with no fallback", () => {
  const expected: Record<string, string> = {
    curiosity: "D1",
    "strategic-thinking": "D1",
    "analytical-interest": "D1",
    "data-systemizing": "D1",
    "technical-interest": "D1",
    innovativeness: "D2",
    "aesthetic-sense": "D2",
    "creative-expression": "D2",
    adaptability: "D2",
    discipline: "D3",
    "result-orientation": "D3",
    organizer: "D3",
    persistence: "D3",
    leadership: "D4",
    energizer: "D4",
    "entrepreneurial-drive": "D4",
    communicator: "D5",
    networker: "D5",
    empathy: "D5",
    harmonizer: "D5",
    "team-player": "D5",
    reliability: "D5",
    "stress-resilience": "D6",
    composure: "D6",
    autonomy: "D6",
  };
  assert.deepEqual(new Set(Object.keys(expected)), new Set(TEEN_TRAIT_IDS));
  const perDomain = new Map<string, number>();
  for (const [id, domain] of Object.entries(expected)) {
    assert.equal(domainOfTraitId(id, "teen"), domain, `${id} must resolve to ${domain}`);
    assert.notEqual(traitDomainColorKey(id, "teen"), FALLBACK_COLOR_KEY, `${id} must not fall back`);
    perDomain.set(domain, (perDomain.get(domain) ?? 0) + 1);
  }
  assert.deepEqual(
    DOMAIN_CODES.map((code) => perDomain.get(code) ?? 0),
    [5, 4, 4, 3, 6, 3],
  );
  // Точечные проверки из ТЗ.
  assert.equal(domainOfTraitId("persistence", "teen"), "D3");
  assert.equal(domainOfTraitId("communicator", "teen"), "D5");
  assert.equal(domainOfTraitId("reliability", "teen"), "D5");
  assert.equal(domainOfTraitId("entrepreneurial-drive", "teen"), "D4");
});

test("assessment version selects the taxonomy, not the id spelling", () => {
  assert.equal(taxonomyForAssessmentVersion(T_SKILLS_TEEN_V3_VERSION_IDS.assessment), "teen");
  assert.equal(taxonomyForAssessmentVersion(T_SKILLS_TEEN_VERSION_IDS.assessment), "teen");
  assert.equal(taxonomyForAssessmentVersion(T_SKILLS_VERSION_IDS.assessment), "adult");
  assert.equal(taxonomyForAssessmentVersion("orbita30_ru_v2"), "legacy");
  assert.equal(taxonomyForAssessmentVersion("orbita30_ru_v1"), "legacy");
});

test("landing examples resolve colors through stable ids, not localized names", () => {
  assert.deepEqual(
    MOCK_TOP5.map((item) => item.id),
    ["systems-thinking", "analytical", "strategic", "responsibility", "persistence"],
  );
  assert.deepEqual(
    MOCK_TOP5_KK.map((item) => item.id),
    MOCK_TOP5.map((item) => item.id),
  );
  for (const item of [...MOCK_TOP5, ...MOCK_TOP5_KK]) {
    assert.ok(domainOfTraitId(item.id, "adult"), `${item.id} must resolve to a domain`);
  }
  assert.equal(traitDomainHex("systems-thinking", "adult"), traitDomainHex("analytical", "adult"));
  assert.notEqual(traitDomainHex("analytical", "adult"), traitDomainHex("responsibility", "adult"));
});

test("no positional color math remains in results, PDF, landing, catalog or methodology", () => {
  for (const file of [
    "app/views/results/results-view.tsx",
    "lib/pdf-generator.ts",
    "app/landing/landing-page.tsx",
    "app/views/catalog/catalog-view.tsx",
    "app/views/methodology/methodology-view.tsx",
    "app/views/teen/teen-flow-view.tsx",
  ]) {
    const source = readFileSync(file, "utf-8");
    assert.ok(!source.includes("Math.floor(index / 5)"), `${file} must not color by position`);
  }
  const results = readFileSync("app/views/results/results-view.tsx", "utf-8");
  assert.ok(!results.includes("DOMAIN_COLORS") && !results.includes("DOMAIN_HEX"));
  assert.ok(results.includes("traitDomainColorKey") && results.includes("traitDomainHex"));
  // Горизонтальные полосы полного профиля залиты цветом домена, а не var(--primary).
  assert.ok(results.includes("background: traitDomainHex(String(trait.code), taxonomy)"));
  // Полосы топ-качеств отдельного /teen-отчёта: teen-контекст, ширина без изменений.
  const teenFlow = readFileSync("app/views/teen/teen-flow-view.tsx", "utf-8");
  assert.ok(teenFlow.includes('background: traitDomainHex(trait.traitId, "teen")'));
  assert.ok(teenFlow.includes("((trait.normalized + 1) / 2) * 100"));
  const pdf = readFileSync("lib/pdf-generator.ts", "utf-8");
  assert.ok(pdf.includes("domainOfTraitId"));
  assert.ok(pdf.includes("taxonomyForAssessmentVersion"));
});
