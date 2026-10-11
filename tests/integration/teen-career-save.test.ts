import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { getD1 } from "@/db";
import {
  buildTeenCareerPersistence,
  StoreError,
  type DurableSession,
} from "@/lib/durable-store";
import {
  TEEN_CAREER_CATALOG_V1,
  TEEN_CAREER_CATALOG_V2,
  teenCareerEntry,
} from "@/lib/t-skills/teen/careers";
import { scoreTeenStage1, selectTeenStage2 } from "@/lib/t-skills/teen/scoring";
import { teenFinalTotals, teenRuntimeContent } from "@/lib/t-skills/teen/runtime";
import { T_SKILLS_TEEN_V3_VERSION_IDS, T_SKILLS_TEEN_V4_VERSION_IDS } from "@/lib/t-skills/versions";
import type { Viewer } from "@/lib/server-auth";
import { env } from "../helpers/cf-workers-stub.mjs";
import { createTempD1 } from "../helpers/temp-d1.mjs";

const ONBOARDING_EXTENSIONS = JSON.stringify({
  valueRanking: ["growth", "creative-freedom", "income", "stability", "value-autonomy", "social-impact", "status", "work-life-balance"],
});

function seed() {
  const d1 = createTempD1();
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    d1.exec(readFileSync(`drizzle/${file}`, "utf8"));
  }
  // Migrations re-enable FK checks; onboarding rows reference fabricated
  // assessment/user ids, so tests run with FK off (temp DB only).
  d1.exec("PRAGMA foreign_keys = OFF");
  env.DB = d1 as never;
  return d1;
}

function viewer(): Viewer {
  return { userId: "user-career-test", email: "career@test.local", displayName: "Career Test", fullName: null };
}

function answers75() {
  return Object.fromEntries(Array.from({ length: 75 }, (_, i) => [`t75-${i + 1}`, [2, -1, 0, 1, -2][i % 5]]));
}

function stage2For(core: Record<string, number>) {
  const content = teenRuntimeContent("ru");
  const items = content.items75.map((item) => ({ id: item.id, leftTraitId: item.leftTraitId, rightTraitId: item.rightTraitId }));
  const stage1 = scoreTeenStage1(items, core);
  const traits = selectTeenStage2(stage1.totals, stage1.contributions);
  const questions = content.stage2.filter((q) => traits.includes(q.traitId));
  assert.equal(questions.length, traits.length);
  return { ids: questions.map((q) => q.id), questions };
}

function makeSession(versions: Record<string, string>): { session: DurableSession; totals: ReturnType<typeof teenFinalTotals> } {
  const core = answers75();
  const { ids, questions } = stage2For(core);
  const responses: Record<string, number> = { ...core };
  for (const id of ids) responses[id] = 1;
  const totals = teenFinalTotals(responses, ids);
  const session = {
    id: "sess-career-test",
    userId: "user-career-test",
    testId: "t-skills",
    locale: "ru",
    versions,
    responses,
    responseTimes: {},
    adaptiveItemIds: ids,
    adaptiveItems: questions,
  } as unknown as DurableSession;
  return { session, totals };
}

function insertOnboarding(d1: ReturnType<typeof createTempD1>) {
  d1.prepare(`INSERT INTO assessment_onboarding
      (id, assessment_id, user_id, age, education_level, favorite_subjects_json, extensions_json, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind("ob-career-test", "sess-career-test", "user-career-test", 16, "school",
      JSON.stringify(["math", "physics"]), ONBOARDING_EXTENSIONS, "teen-onboarding-v1", 1, 1).run();
}

function careerRowCounts(d1: ReturnType<typeof createTempD1>) {
  const a = d1.prepare(`SELECT COUNT(*) AS n FROM t_skills_career_results`).bind().first<{ n: number }>()?.n ?? -1;
  const b = d1.prepare(`SELECT COUNT(*) AS n FROM career_match_snapshots`).bind().first<{ n: number }>()?.n ?? -1;
  return [a, b];
}

test("real save path stores one catalog version everywhere and resolves p002 through it", async () => {
  const d1 = seed();
  try {
    insertOnboarding(d1);
    const { session, totals } = makeSession({ ...T_SKILLS_TEEN_V3_VERSION_IDS });
    const before = careerRowCounts(d1);
    // buildTeenCareerPersistence returns prepared statements; the real caller
    // (completeAssessmentForUser) executes them in one batch — same here.
    const saved = await buildTeenCareerPersistence(session, viewer(), totals, getD1() as never);
    await (getD1() as unknown as { batch: (stmts: unknown[]) => Promise<unknown> }).batch(
      saved.statements as unknown[],
    );
    const after = careerRowCounts(d1);
    assert.deepEqual(after, [before[0] + 1, before[1] + 1]);

    const resultRow = d1.prepare(`SELECT career_catalog_version, candidates_json FROM t_skills_career_results WHERE assessment_id = ?`)
      .bind("sess-career-test").first<{ career_catalog_version: string; candidates_json: string }>()!;
    const snapRow = d1.prepare(`SELECT career_catalog_version, candidates_json FROM career_match_snapshots WHERE assessment_id = ?`)
      .bind("sess-career-test").first<{ career_catalog_version: string; candidates_json: string }>()!;
    assert.equal(resultRow.career_catalog_version, TEEN_CAREER_CATALOG_V1);
    assert.equal(snapRow.career_catalog_version, TEEN_CAREER_CATALOG_V1);
    const snapshot = JSON.parse(snapRow.candidates_json) as { careerCatalogVersion?: unknown; candidates?: unknown[] };
    assert.equal(snapshot.careerCatalogVersion, TEEN_CAREER_CATALOG_V1);

    // p002 resolved through the SAME saved version, in both languages.
    const savedVersion = resultRow.career_catalog_version;
    assert.equal(savedVersion, (JSON.parse(snapRow.candidates_json) as { careerCatalogVersion: string }).careerCatalogVersion);
    assert.equal(teenCareerEntry(savedVersion, "p002", "ru")?.title, "Педиатр");
    assert.equal(teenCareerEntry(savedVersion, "p002", "kk")?.title, "Педиатр");
  } finally {
    delete (env as Record<string, unknown>).DB;
  }
});

test("UNKNOWN/MISMATCH sessions save nothing", async () => {
  const d1 = seed();
  try {
    insertOnboarding(d1);
    const { session, totals } = makeSession({ ...T_SKILLS_TEEN_V3_VERSION_IDS });
    const before = careerRowCounts(d1);
    const db = getD1() as never;
    await assert.rejects(
      buildTeenCareerPersistence(
        { ...session, versions: { ...T_SKILLS_TEEN_V3_VERSION_IDS, careerCatalog: "t-skills-teen-careers-v9" } } as unknown as DurableSession,
        viewer(), totals, db,
      ),
      (error: unknown) => error instanceof StoreError && error.code.startsWith("TEEN_CAREER_CATALOG_UNKNOWN"),
    );
    await assert.rejects(
      buildTeenCareerPersistence(
        { ...session, versions: { ...T_SKILLS_TEEN_V3_VERSION_IDS, careerCatalog: TEEN_CAREER_CATALOG_V2 } } as unknown as DurableSession,
        viewer(), totals, db,
      ),
      (error: unknown) => error instanceof StoreError && error.code.startsWith("TEEN_CAREER_CATALOG_MISMATCH"),
    );
    assert.deepEqual(careerRowCounts(d1), before);
  } finally {
    delete (env as Record<string, unknown>).DB;
  }
});

test("new v4 session saves 111 candidates under the v2 catalog", async () => {
  const d1 = seed();
  try {
    insertOnboarding(d1);
    const { session, totals } = makeSession({ ...T_SKILLS_TEEN_V4_VERSION_IDS });
    const saved = await buildTeenCareerPersistence(session, viewer(), totals, getD1() as never);
    await (getD1() as unknown as { batch: (stmts: unknown[]) => Promise<unknown> }).batch(
      saved.statements as unknown[],
    );
    const resultRow = d1.prepare(`SELECT career_catalog_version, candidates_json FROM t_skills_career_results WHERE assessment_id = ?`)
      .bind("sess-career-test").first<{ career_catalog_version: string; candidates_json: string }>()!;
    const snapRow = d1.prepare(`SELECT career_catalog_version, candidates_json FROM career_match_snapshots WHERE assessment_id = ?`)
      .bind("sess-career-test").first<{ career_catalog_version: string; candidates_json: string }>()!;
    assert.equal(resultRow.career_catalog_version, TEEN_CAREER_CATALOG_V2);
    assert.equal(snapRow.career_catalog_version, TEEN_CAREER_CATALOG_V2);
    const snapshot = JSON.parse(snapRow.candidates_json) as { careerCatalogVersion?: unknown; candidates?: unknown[] };
    assert.equal(snapshot.careerCatalogVersion, TEEN_CAREER_CATALOG_V2);
    assert.equal(snapshot.candidates?.length, 111);
    assert.equal(saved.candidates.length, 111);
    // p002 through the saved v2 catalog, both languages.
    assert.equal(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", "ru")?.title, "Стоматолог");
    assert.ok(teenCareerEntry(TEEN_CAREER_CATALOG_V2, "p002", "kk")?.title);
  } finally {
    delete (env as Record<string, unknown>).DB;
  }
});
