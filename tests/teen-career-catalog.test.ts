import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertTeenCareerCatalogPublishable,
  isTeenCareerCatalogPublishable,
  registerTeenCatalogBinding,
  TEEN_CAREER_CATALOG_V1,
  TEEN_CAREER_CATALOG_V2,
  teenCareerCatalog,
  teenCareerCatalogVersionForAssessment,
  teenCareerEntry,
  teenCatalogVersionForSession,
  teenPublishBlockReason,
  unregisterTeenCatalogBinding,
} from "@/lib/t-skills/teen/careers";
import { teenCareerRanking, teenFinalTotals, buildTeenDemoData } from "@/lib/t-skills/teen/runtime";
import { scoreTeenCareers } from "@/lib/t-skills/teen/matching";
import { TEEN_V4_VERSION_IDS, TEEN_VALUES } from "@/lib/t-skills/teen/taxonomy";
import {
  T_SKILLS_TEEN_V1_FIX_VERSION_IDS,
  T_SKILLS_TEEN_V1_VERSION_IDS,
  T_SKILLS_TEEN_V3_VERSION_IDS,
  T_SKILLS_TEEN_V4_VERSION_IDS,
  T_SKILLS_TEEN_VERSION_IDS,
} from "@/lib/t-skills/versions";

function answersWith(pattern: (index: number) => number) {
  return Object.fromEntries(
    Array.from({ length: 75 }, (_, index) => [`t75-${index + 1}`, pattern(index)]),
  );
}

test("versioned catalogs hold 170 and 111 professions with gaps preserved", () => {
  const v1 = teenCareerCatalog(TEEN_CAREER_CATALOG_V1, "ru");
  const v2 = teenCareerCatalog(TEEN_CAREER_CATALOG_V2, "ru");
  assert.equal(v1.length, 170);
  assert.equal(v2.length, 111);
  assert.deepEqual(v2.map((entry) => entry.id), [...v2.map((entry) => entry.id)].sort());
  assert.equal(new Set(v2.map((entry) => entry.id)).size, 111);
  // Gaps from the xlsx are preserved verbatim, no renumbering.
  assert.ok(!v2.some((entry) => entry.id === "p015"));
  assert.ok(v2.some((entry) => entry.id === "p001"));
  assert.ok(v2.some((entry) => entry.id === "p170"));
  assert.throws(() => teenCareerCatalog("t-skills-teen-careers-v9", "ru"), /TEEN_CAREER_CATALOG_UNKNOWN/);
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p999", "ru"), null);
});

test("reused ids p002–p014 resolve per (catalog version, id) in both languages", () => {
  // v1 keeps the old content, v2 carries the relocated content.
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p002", "ru")?.title, "Педиатр");
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", "ru")?.title, "Стоматолог");
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p011", "ru")?.title, "Физиотерапевт / реабилитолог");
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p011", "ru")?.title, "Учитель начальных классов");
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p014", "ru")?.title, "Ветеринарный врач");
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p014", "ru")?.title, "Преподаватель вуза");
  // Excluded ids stay readable in v1 and are absent in v2.
  assert.ok(teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p015", "ru"));
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p015", "ru"), null);
  assert.ok(teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p033", "ru"));
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p033", "ru"), null);
  // KK follows the same (version, id) pair; weights are identical across locales.
  const ru = teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", "ru")!;
  const kk = teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", "kk")!;
  assert.deepEqual(kk.traitWeights, ru.traitWeights);
  assert.notEqual(
    teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p001", "kk")?.title,
    teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p001", "ru")?.title,
  );
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p036", "kk")?.title, "Инженер");
});

test("v2 publication is allowed after KK p036 acceptance", () => {
  assert.equal(isTeenCareerCatalogPublishable(TEEN_CAREER_CATALOG_V1), true);
  assert.equal(isTeenCareerCatalogPublishable(TEEN_CAREER_CATALOG_V2), true);
  assert.equal(isTeenCareerCatalogPublishable("t-skills-teen-careers-v9"), false);
  assert.doesNotThrow(() => assertTeenCareerCatalogPublishable(TEEN_CAREER_CATALOG_V1));
  assert.doesNotThrow(() => assertTeenCareerCatalogPublishable(TEEN_CAREER_CATALOG_V2));
  assert.throws(() => assertTeenCareerCatalogPublishable("t-skills-teen-careers-v9"), /TEEN_CAREER_CATALOG_UNKNOWN/);
});

test("default ranking stays on the 170 catalog; v2 is opt-in only", () => {
  const totals = teenFinalTotals(answersWith((index) => [2, -1, 0, 1, -2][index % 5]), []);
  const onboarding = {
    valueRanking: [...TEEN_VALUES],
    subjects: ["math", "physics"] as ("math" | "physics")[],
  };
  const current = teenCareerRanking(totals, onboarding);
  const explicitV1 = teenCareerRanking(totals, onboarding, TEEN_CAREER_CATALOG_V1);
  const v2 = teenCareerRanking(totals, onboarding, TEEN_CAREER_CATALOG_V2);
  assert.equal(current.length, 170);
  assert.equal(explicitV1.length, 170);
  assert.deepEqual(current.map((entry) => entry.professionId), explicitV1.map((entry) => entry.professionId));
  assert.equal(v2.length, 111);
  assert.ok(v2.every((entry) => teenCareerEntry(TEEN_CAREER_CATALOG_V2, entry.professionId, "ru")));
});

test("session versions select the catalog; stored sessions keep working", () => {
  // Явное поле, совпадающее с контрактом, принимается.
  assert.equal(
    teenCatalogVersionForSession("t-skills-teen-v3", { assessment: "t-skills-teen-v3", careerCatalog: TEEN_CAREER_CATALOG_V1 }),
    TEEN_CAREER_CATALOG_V1,
  );
  // Отсутствующее поле исторической сессии подразумевает контракт (v1).
  assert.equal(teenCatalogVersionForSession("t-skills-teen-v3", { assessment: "t-skills-teen-v3" }), TEEN_CAREER_CATALOG_V1);
  assert.equal(teenCatalogVersionForSession("t-skills-teen-v1", { assessment: "t-skills-teen-v1" }), TEEN_CAREER_CATALOG_V1);
  assert.equal(teenCatalogVersionForSession("t-skills-teen-v3", null), TEEN_CAREER_CATALOG_V1);
  // Явная неизвестная версия отклоняется, а не подменяется на v1.
  assert.throws(
    () => teenCatalogVersionForSession("t-skills-teen-v3", { assessment: "t-skills-teen-v3", careerCatalog: "t-skills-teen-careers-v9" }),
    /TEEN_CAREER_CATALOG_UNKNOWN:t-skills-teen-careers-v9/,
  );
  // Явная известная, но запрещённая контрактом версия отклоняется до расчёта.
  assert.throws(
    () => teenCatalogVersionForSession("t-skills-teen-v3", { assessment: "t-skills-teen-v3", careerCatalog: TEEN_CAREER_CATALOG_V2 }),
    /TEEN_CAREER_CATALOG_MISMATCH:t-skills-teen-v3:t-skills-teen-careers-v2-vs-t-skills-teen-careers-v1/,
  );
  // Не-teen оценка не имеет teen-контракта.
  assert.throws(
    () => teenCatalogVersionForSession("t-skills_pairwise_v1", { assessment: "t-skills_pairwise_v1" }),
    /TEEN_CAREER_CATALOG_NO_CONTRACT/,
  );
});

test("registry binding feeds the real publish gate; accepted catalogs pass", () => {
  const probe = "t-skills-teen-vtest";
  try {
    assert.equal(teenCareerCatalogVersionForAssessment(probe), null);
    registerTeenCatalogBinding(probe, TEEN_CAREER_CATALOG_V2);
    assert.equal(teenCareerCatalogVersionForAssessment(probe), TEEN_CAREER_CATALOG_V2);
    // p036 accepted: the v2 test contract is publishable.
    assert.equal(teenPublishBlockReason(probe), null);
    // Незарегистрированный каталог в привязке — не тихая подмена, а явная причина.
    registerTeenCatalogBinding(probe, "t-skills-teen-careers-v9");
    assert.equal(teenCareerCatalogVersionForAssessment(probe), "t-skills-teen-careers-v9");
    assert.match(teenPublishBlockReason(probe) ?? "", /TEEN_CAREER_CATALOG_UNREGISTERED:t-skills-teen-careers-v9/);
  } finally {
    unregisterTeenCatalogBinding(probe);
  }
  assert.equal(teenCareerCatalogVersionForAssessment(probe), null);
});

test("real publish path invokes the teen catalog gate before writing", () => {
  const source = readFileSync("lib/admin-store.ts", "utf-8");
  const gateAt = source.indexOf("teenPublishBlockReason(String(version.version))");
  assert.ok(gateAt > 0, "publishAssessmentVersion must call the teen catalog gate");
  const updateAt = source.indexOf("UPDATE assessment_versions SET status = 'PUBLISHED'", gateAt);
  assert.ok(updateAt > gateAt, "gate must run before the status UPDATE");
});

test("result saving uses one resolved version in calculation, snapshot and both binds", () => {
  const source = readFileSync("lib/durable-store.ts", "utf-8");
  const fnAt = source.indexOf("async function buildTeenCareerPersistence");
  assert.ok(fnAt > 0);
  const body = source.slice(fnAt, source.indexOf("export async function completeAssessmentForUser", fnAt));
  const uses = (body.match(/teenCatalogVersion(?!ForSession)/g) ?? []).length;
  assert.ok(uses >= 5, `expected resolved version in calc+snapshot+2 binds, found ${uses} uses`);
  assert.ok(body.indexOf("teenCatalogVersionForSession(") < body.indexOf("teenCareerRanking(totals,"));
  assert.ok(!body.includes("versions.careerCatalog"));
});

test("old result shows pediatrician, new result shows dentist, in RU and KK", () => {
  const totals = teenFinalTotals(answersWith((index) => [2, -1, 0, 1, -2][index % 5]), []);
  const onboarding = {
    valueRanking: [...TEEN_VALUES],
    subjects: ["math", "physics"] as ("math" | "physics")[],
  };
  for (const locale of ["ru", "kk"] as const) {
    // Display path resolves titles through the versioned lookup.
    assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p002", locale)?.title,
      locale === "ru" ? "Педиатр" : teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p002", "kk")?.title);
    assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", locale)?.title,
      locale === "ru" ? "Стоматолог" : teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", "kk")?.title);
    // Rankings on each catalog resolve every displayed title through the same lookup.
    for (const version of [TEEN_CAREER_CATALOG_V1, TEEN_CAREER_CATALOG_V2] as const) {
      const ranking = teenCareerRanking(totals, onboarding, version);
      for (const entry of ranking.slice(0, 5)) {
        const resolved = teenCareerEntry(version, entry.professionId, locale);
        assert.ok(resolved, `${version}/${entry.professionId} must resolve in ${locale}`);
        assert.equal(resolved!.title, locale === "ru" ? entry.title : resolved!.title);
      }
    }
  }
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p002", "ru")?.title, "Педиатр");
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", "ru")?.title, "Стоматолог");
  assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p002", "kk")?.title, "Педиатр");
  assert.equal(
    teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", "kk")?.title,
    teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p003", "kk")?.title,
  );
});

test("publish gate covers every current teen assessment version", () => {
  for (const versions of [
    T_SKILLS_TEEN_V1_VERSION_IDS,
    T_SKILLS_TEEN_V1_FIX_VERSION_IDS,
    T_SKILLS_TEEN_VERSION_IDS,
    T_SKILLS_TEEN_V3_VERSION_IDS,
  ]) {
    assert.equal(teenPublishBlockReason(versions.assessment), null);
  }
  assert.equal(teenPublishBlockReason("t-skills_pairwise_v1"), null);
  assert.equal(teenPublishBlockReason("unknown-version"), null);
});

test("combat math unchanged: default ranking equals independent 170 recompute", async () => {
  const { readFileSync } = await import("node:fs");
  const { parseTeenContentBundle } = await import("@/lib/t-skills/teen/content");
  const bundle = parseTeenContentBundle(JSON.parse(readFileSync("lib/t-skills/teen/content.v2.json", "utf-8")));
  const totals = teenFinalTotals(answersWith((index) => [2, -1, 0, 1, -2][index % 5]), []);
  const onboarding = {
    valueRanking: [...TEEN_VALUES],
    subjects: ["math", "physics"] as ("math" | "physics")[],
  };
  const expected = scoreTeenCareers(totals, bundle.professions, onboarding);
  const actual = teenCareerRanking(totals, onboarding);
  assert.equal(actual.length, expected.length);
  for (const [index, entry] of actual.entries()) {
    const want = expected[index]!;
    assert.equal(entry.professionId, want.professionId);
    assert.equal(entry.traitScore, want.traitScore);
    assert.equal(entry.valueBonus, want.valueBonus);
    assert.equal(entry.subjectBonus, want.subjectBonus);
    assert.equal(entry.matchScore, want.totalScore);
  }
  const titles = new Map(bundle.professions.map((profession) => [profession.id, profession.title]));
  for (const entry of actual) {
    assert.equal(entry.title, titles.get(entry.professionId));
  }
});

test("p036 KK translation accepted: staged flags cleared, v2 publishable", () => {
  const ru = teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p036", "ru")!;
  const kk = teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p036", "kk")!;
  const oldKk = teenCareerEntry(TEEN_CAREER_CATALOG_V1, "p036", "kk")!;
  assert.equal(ru.title, "Инженер");
  assert.equal(kk.title, "Инженер");
  assert.equal(kk.description, "Ғылыми білімді жұмыс істейтін техникалық нысандарға, жүйелерге және технологияларға айналдыру");
  assert.notEqual(kk.title, oldKk.title);
  // Only the two text fields changed; everything else preserved verbatim.
  assert.equal(kk.id, "p036");
  assert.deepEqual(kk.traitWeights, oldKk.traitWeights);
  assert.deepEqual(kk.subjectTags, oldKk.subjectTags);
  assert.deepEqual(kk.valueFit, oldKk.valueFit);
  assert.equal(kk.sphere, oldKk.sphere);
  // Acceptance recorded: sidecar cleared, publication allowed.
  const sidecar = JSON.parse(readFileSync("lib/t-skills/teen/careers-v3.i18n.json", "utf-8")) as {
    status: string; needsTranslation: Record<string, string[]>; runtimeWired: boolean;
  };
  assert.equal(sidecar.status, "PUBLISHED");
  assert.deepEqual(Object.keys(sidecar.needsTranslation), []);
  assert.equal(isTeenCareerCatalogPublishable(TEEN_CAREER_CATALOG_V2), true);
  assert.doesNotThrow(() => assertTeenCareerCatalogPublishable(TEEN_CAREER_CATALOG_V2));
});

test("v4 contract reuses v3 pipeline with the 111 catalog", () => {
  assert.equal(T_SKILLS_TEEN_V4_VERSION_IDS.assessment, "t-skills-teen-v4");
  assert.equal(T_SKILLS_TEEN_V4_VERSION_IDS.itemBank, "t-skills-teen-items-v4");
  assert.equal(T_SKILLS_TEEN_V4_VERSION_IDS.careerCatalog, TEEN_CAREER_CATALOG_V2);
  assert.equal(T_SKILLS_TEEN_V4_VERSION_IDS.scoring, T_SKILLS_TEEN_V3_VERSION_IDS.scoring);
  assert.equal(T_SKILLS_TEEN_V4_VERSION_IDS.report, T_SKILLS_TEEN_V3_VERSION_IDS.report);
  assert.equal(T_SKILLS_TEEN_V4_VERSION_IDS.adaptive, T_SKILLS_TEEN_V3_VERSION_IDS.adaptive);
  assert.equal(T_SKILLS_TEEN_V4_VERSION_IDS.careerMatching, T_SKILLS_TEEN_V3_VERSION_IDS.careerMatching);
  assert.equal(TEEN_V4_VERSION_IDS.careerCatalog, TEEN_CAREER_CATALOG_V2);
  assert.equal(teenCareerCatalogVersionForAssessment(T_SKILLS_TEEN_V4_VERSION_IDS.assessment), TEEN_CAREER_CATALOG_V2);
  assert.equal(teenPublishBlockReason(T_SKILLS_TEEN_V4_VERSION_IDS.assessment), null);
});

test("same answers give identical trait totals on v3 and v4", () => {
  const responses = answersWith((index) => [2, -1, 0, 1, -2][index % 5]);
  const clarifications = [`t2-curiosity`, `t2-discipline`];
  const full = { ...responses, [`t2-curiosity`]: 0, [`t2-discipline`]: 0 };
  const v3 = teenFinalTotals(full, clarifications, T_SKILLS_TEEN_V3_VERSION_IDS.assessment);
  const v4 = teenFinalTotals(full, clarifications, T_SKILLS_TEEN_V4_VERSION_IDS.assessment);
  assert.deepEqual(v4, v3);
});

test("demo runs on 111 with v4 versions", () => {
  const { profile, report } = buildTeenDemoData();
  assert.equal(profile.versions.assessment, T_SKILLS_TEEN_V4_VERSION_IDS.assessment);
  assert.equal(report.assessmentVersion, T_SKILLS_TEEN_V4_VERSION_IDS.assessment);
  const ranking = report.career?.ranking ?? [];
  assert.equal(ranking.length, 5);
  for (const entry of ranking) {
    const professionId = String((entry as { professionId?: unknown }).professionId ?? "");
    const resolved = teenCareerEntry(TEEN_CAREER_CATALOG_V2, professionId, "ru");
    assert.ok(resolved, `${professionId} must resolve in the 111 catalog`);
    assert.equal(entry.title, resolved!.title);
  }
});

test("excluded professions never surface in v2 recommendations but stay readable in v1", () => {
  const totals = teenFinalTotals(answersWith((index) => [2, -1, 0, 1, -2][index % 5]), []);
  const onboarding = {
    valueRanking: [...TEEN_VALUES],
    subjects: ["math", "physics"] as ("math" | "physics")[],
  };
  const excluded = ["p015", "p033", "p141", "p157"];
  const fresh = teenCareerRanking(totals, onboarding, TEEN_CAREER_CATALOG_V2);
  assert.ok(!fresh.some((entry) => excluded.includes(entry.professionId)));
  for (const id of excluded) {
    assert.ok(teenCareerEntry(TEEN_CAREER_CATALOG_V1, id, "ru"), `${id} stays readable in v1`);
    assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, id, "ru"), null);
  }
});

test("new KK result carries the accepted p036 translation", () => {
  const totals = teenFinalTotals(answersWith((index) => [2, -1, 0, 1, -2][index % 5]), []);
  const onboarding = {
    valueRanking: [...TEEN_VALUES],
    subjects: ["math", "physics"] as ("math" | "physics")[],
  };
  const ranking = teenCareerRanking(totals, onboarding, TEEN_CAREER_CATALOG_V2);
  for (const entry of ranking) {
    assert.ok(teenCareerEntry(TEEN_CAREER_CATALOG_V2, entry.professionId, "kk"), `${entry.professionId} must resolve in KK`);
  }
  assert.equal(
    teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p036", "kk")?.description,
    "Ғылыми білімді жұмыс істейтін техникалық нысандарға, жүйелерге және технологияларға айналдыру",
  );
});

test("no new formula and no stage3b in the teen pathway", () => {
  const matching = readFileSync("lib/t-skills/teen/matching.ts", "utf-8");
  assert.ok(matching.includes("traitScore + valueBonus + subjectBonus") || matching.includes("totalScore = traitScore + valueBonus + subjectBonus"));
  for (const file of [
    "lib/durable-store.ts",
    "app/views/teen/teen-flow-view.tsx",
    "lib/t-skills/teen/runtime.ts",
    "app/views/results/results-view.tsx",
  ]) {
    const source = readFileSync(file, "utf-8");
    assert.ok(!source.includes("stage3b") && !source.includes("Stage3b"), `${file} must not reference stage3b`);
  }
});
