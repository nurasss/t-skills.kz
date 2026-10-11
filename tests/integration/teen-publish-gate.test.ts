import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { publishAssessmentVersion } from "@/lib/admin-store";
import { StoreError } from "@/lib/durable-store";
import {
  registerTeenCatalogBinding,
  TEEN_CAREER_CATALOG_V2,
  teenPublishBlockReason,
  unregisterTeenCatalogBinding,
} from "@/lib/t-skills/teen/careers";
import type { AdminContext } from "@/lib/admin-rbac";
import { env } from "../helpers/cf-workers-stub.mjs";
import { createTempD1 } from "../helpers/temp-d1.mjs";

const V3 = {
  assessment: "t-skills-teen-v3",
  scoringVersion: "teen-scoring-v2",
  contentVersion: "t-skills-teen-items-v3",
  careerModelVersion: "teen-career-matching-v1",
  reportVersion: "t-skills-teen-report-v2",
  adaptiveVersion: "teen-clarification-v1",
  itemCount: 100,
};

function seed() {
  const d1 = createTempD1();
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    d1.exec(readFileSync(`drizzle/${file}`, "utf8"));
  }
  // Migrations leave FK enforcement ON and seed published rows; tests run
  // with FK off and reshape the migrated v1/v3 rows instead of re-inserting.
  // NOTE: seed() applies the real 0026 migration, so v4 is PUBLISHED here;
  // the test re-points v3 to DRAFT to exercise the publish path itself.
  d1.exec("PRAGMA foreign_keys = OFF");
  env.DB = d1 as never;
  const run = (sql: string, ...args: unknown[]) => d1.prepare(sql).bind(...(args as never[])).run();
  // Career model seeded by 0023_teen_assessment_version.sql; keep it.
  run(`UPDATE assessment_versions SET status = 'PUBLISHED', published_at = 1, retired_at = NULL
       WHERE version = 't-skills-teen-v1'`);
  run(`UPDATE assessment_versions SET status = 'DRAFT', published_at = NULL, retired_at = NULL,
       scoring_version = ?, content_version = ?, career_model_version = ?, report_version = ?,
       adaptive_version = ?, item_count = ?, metadata_json = '{}'
       WHERE version = 't-skills-teen-v3'`,
    V3.scoringVersion, V3.contentVersion, V3.careerModelVersion, V3.reportVersion, V3.adaptiveVersion, V3.itemCount);
  run(`UPDATE assessment_versions SET status = 'RETIRED', retired_at = 1
       WHERE version = 't-skills-teen-v4'`);
  return d1;
}

const context = {
  viewer: { userId: "admin-test", email: "admin@test.local", displayName: "Admin", fullName: null },
  roles: ["SUPER_ADMIN"],
  permissions: new Set(),
} as unknown as AdminContext;

const request = () => new Request("http://localhost/admin/assessment-versions", { method: "POST" });

test("real publishAssessmentVersion rejects an unregistered-catalog binding", async () => {
  const d1 = seed();
  const idOf = (version: string) =>
    d1.prepare(`SELECT id FROM assessment_versions WHERE version = ?`).bind(version).first<{ id: string }>()?.id;
  const statusOf = (version: string) =>
    d1.prepare(`SELECT status FROM assessment_versions WHERE version = ?`).bind(version).first<{ status: string }>()?.status;
  const v3id = idOf("t-skills-teen-v3")!;
  assert.ok(v3id, "migrated v3 row must exist");
  const auditCount = () =>
    (d1.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'ASSESSMENT_VERSION_PUBLISHED'`).bind().first<{ n: number }>()?.n ?? 0);
  assert.equal(statusOf("t-skills-teen-v3"), "DRAFT");
  assert.equal(statusOf("t-skills-teen-v1"), "PUBLISHED");

  // A binding to a catalog that is not registered must be rejected by the
  // real publish path — no silent substitution with v1.
  registerTeenCatalogBinding("t-skills-teen-v3", "t-skills-teen-careers-v9");
  try {
    await assert.rejects(
      publishAssessmentVersion({ context, request: request(), versionId: v3id, reason: "integration test" }),
      (error: unknown) => error instanceof StoreError
        && error.code === "TEEN_CAREER_CATALOG_UNREGISTERED:t-skills-teen-careers-v9",
    );
    // DB unchanged by the refusal.
    assert.equal(statusOf("t-skills-teen-v3"), "DRAFT");
    assert.equal(statusOf("t-skills-teen-v1"), "PUBLISHED");
    assert.equal(auditCount(), 0);
  } finally {
    unregisterTeenCatalogBinding("t-skills-teen-v3");
  }
  delete (env as Record<string, unknown>).DB;
});

test("real publishAssessmentVersion publishes an accepted-catalog version", async () => {
  const d1 = seed();
  const statusOf = (version: string) =>
    d1.prepare(`SELECT status FROM assessment_versions WHERE version = ?`).bind(version).first<{ status: string }>()?.status;
  const v3id = d1.prepare(`SELECT id FROM assessment_versions WHERE version = ?`).bind("t-skills-teen-v3").first<{ id: string }>()?.id;
  assert.ok(v3id);
  // v2 catalog accepted: the gate lets a v2-bound version through.
  registerTeenCatalogBinding("t-skills-teen-v3", TEEN_CAREER_CATALOG_V2);
  try {
    assert.equal(teenPublishBlockReason("t-skills-teen-v3"), null);
    const published = await publishAssessmentVersion({ context, request: request(), versionId: v3id, reason: "integration test" });
    assert.equal((published as Record<string, unknown>).status, "PUBLISHED");
    assert.equal(statusOf("t-skills-teen-v1"), "RETIRED");
    assert.equal(
      d1.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'ASSESSMENT_VERSION_PUBLISHED'`).bind().first<{ n: number }>()?.n,
      1,
    );
  } finally {
    unregisterTeenCatalogBinding("t-skills-teen-v3");
    delete (env as Record<string, unknown>).DB;
  }
});
