import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("teen scoring migration publishes v2 and moves only unfinished v1 sessions to the corrected legacy layout", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = OFF");
    const previousMigrations = readdirSync("drizzle")
      .filter((file) => file.endsWith(".sql") && !file.startsWith("0024_"))
      .sort();
    for (const migration of previousMigrations) {
      db.exec(readFileSync(`drizzle/${migration}`, "utf8"));
    }
    db.exec("PRAGMA foreign_keys = OFF");

    const v1 = JSON.stringify({
      assessment: "t-skills-teen-v1",
      itemBank: "t-skills-teen-items-v1",
      scoring: "teen-scoring-v1",
      report: "t-skills-teen-report-v1",
      careerMatching: "teen-career-matching-v1",
      careerCatalog: "t-skills-teen-careers-v1",
      adaptive: "teen-clarification-v1",
    });
    const insertAssessment = db.prepare(
      `INSERT INTO assessments (id, user_id, test_id, state, versions_json, created_at, updated_at, final_score_json, report_id)
       VALUES (?, 'migration-test-user', 't-skills', ?, ?, 1, 1, ?, ?)`,
    );
    insertAssessment.run("unfinished-v1", "CORE_IN_PROGRESS", v1, null, null);
    insertAssessment.run("completed-v1", "COMPLETE", v1, "{}", "existing-report");

    db.exec(readFileSync("drizzle/0024_teen_scoring_direction_v2.sql", "utf8"));

    const unfinished = db.prepare("SELECT versions_json FROM assessments WHERE id = ?").get("unfinished-v1") as { versions_json: string };
    const completed = db.prepare("SELECT versions_json FROM assessments WHERE id = ?").get("completed-v1") as { versions_json: string };
    const unfinishedVersions = JSON.parse(unfinished.versions_json);
    const completedVersions = JSON.parse(completed.versions_json);
    assert.equal(unfinishedVersions.assessment, "t-skills-teen-v1-fix");
    assert.equal(unfinishedVersions.itemBank, "t-skills-teen-items-v1");
    assert.equal(unfinishedVersions.scoring, "teen-scoring-v2");
    assert.equal(completedVersions.assessment, "t-skills-teen-v1");
    assert.equal(completedVersions.scoring, "teen-scoring-v1");
    assert.equal(db.prepare("SELECT status FROM assessment_versions WHERE version = 't-skills-teen-v2'").get()?.status, "PUBLISHED");
    assert.equal(db.prepare("SELECT status FROM assessment_versions WHERE version = 't-skills-teen-v1'").get()?.status, "RETIRED");
    assert.equal(db.prepare("SELECT status FROM assessment_versions WHERE version = 't-skills-teen-v1-fix'").get()?.status, "RETIRED");
  } finally {
    db.close();
  }
});

test("teen v4 migration publishes catalog-111 without rewriting stored sessions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = OFF");
    // State as of 0026; the 0027 v5 revision is covered by its own test below.
    const migrations = readdirSync("drizzle")
      .filter((file) => file.endsWith(".sql") && file <= "0026_teen_v4_catalog_111.sql")
      .sort();
    assert.ok(migrations.includes("0026_teen_v4_catalog_111.sql"));
    for (const migration of migrations) {
      db.exec(readFileSync(`drizzle/${migration}`, "utf8"));
    }
    db.exec("PRAGMA foreign_keys = OFF");

    const v4row = db.prepare(
      "SELECT status, scoring_version, content_version FROM assessment_versions WHERE version = 't-skills-teen-v4'",
    ).get() as { status: string; scoring_version: string; content_version: string };
    assert.equal(v4row.status, "PUBLISHED");
    assert.equal(v4row.content_version, "t-skills-teen-items-v4");
    assert.equal(v4row.scoring_version, "teen-scoring-v2");
    for (const version of ["t-skills-teen-v3", "t-skills-teen-v2", "t-skills-teen-v1"]) {
      assert.equal(db.prepare("SELECT status FROM assessment_versions WHERE version = ?").get(version)?.status, "RETIRED");
    }

    // Stored sessions keep their own versions_json: 0026 must not touch them.
    // Unfinished v3 sessions continue on their own contract and the 170 catalog.
    const frozenV2 = JSON.stringify({
      assessment: "t-skills-teen-v2",
      itemBank: "t-skills-teen-items-v2",
      scoring: "teen-scoring-v1",
      report: "t-skills-teen-report-v1",
      careerMatching: "teen-career-matching-v1",
      careerCatalog: "t-skills-teen-careers-v1",
      adaptive: "teen-clarification-v1",
    });
    const unfinishedV3 = JSON.stringify({
      assessment: "t-skills-teen-v3",
      itemBank: "t-skills-teen-items-v3",
      scoring: "teen-scoring-v2",
      report: "t-skills-teen-report-v2",
      careerMatching: "teen-career-matching-v1",
      careerCatalog: "t-skills-teen-careers-v1",
      adaptive: "teen-clarification-v1",
    });
    db.prepare(
      `INSERT INTO assessments (id, user_id, test_id, state, versions_json, created_at, updated_at, final_score_json, report_id)
       VALUES ('frozen-v2', 'migration-test-user', 't-skills', 'COMPLETE', ?, 1, 1, '{}', 'report-1')`,
    ).run(frozenV2);
    db.prepare(
      `INSERT INTO assessments (id, user_id, test_id, state, versions_json, created_at, updated_at, final_score_json, report_id)
       VALUES ('unfinished-v3', 'migration-test-user', 't-skills', 'CORE_IN_PROGRESS', ?, 1, 1, NULL, NULL)`,
    ).run(unfinishedV3);
    db.exec(readFileSync("drizzle/0026_teen_v4_catalog_111.sql", "utf8"));
    const keptV2 = db.prepare("SELECT versions_json, final_score_json, report_id FROM assessments WHERE id = 'frozen-v2'").get() as { versions_json: string; final_score_json: string; report_id: string };
    assert.equal(JSON.parse(keptV2.versions_json).assessment, "t-skills-teen-v2");
    assert.equal(JSON.parse(keptV2.versions_json).careerCatalog, "t-skills-teen-careers-v1");
    assert.equal(keptV2.final_score_json, "{}");
    assert.equal(keptV2.report_id, "report-1");
    const keptV3 = db.prepare("SELECT versions_json, state FROM assessments WHERE id = 'unfinished-v3'").get() as { versions_json: string; state: string };
    assert.equal(JSON.parse(keptV3.versions_json).assessment, "t-skills-teen-v3");
    assert.equal(JSON.parse(keptV3.versions_json).careerCatalog, "t-skills-teen-careers-v1");
    assert.equal(keptV3.state, "CORE_IN_PROGRESS");
    assert.equal(db.prepare("SELECT status FROM assessment_versions WHERE version = 't-skills-teen-v4'").get()?.status, "PUBLISHED");
  } finally {
    db.close();
  }
});
