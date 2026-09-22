/**
 * Every table below is owned by an assessment and has an assessment_id
 * foreign key. Keep this registry in sync with migrations before adding a new
 * assessment artifact table; deletion and retention consume it centrally.
 *
 * The career_* tables are retained for legacy/schema compatibility. The
 * current runtime writes the adaptive_* and t_skills_* tables, but historical
 * rows in either family must still be removable.
 */
export const ASSESSMENT_DATA_TABLES = [
  { name: "assessment_responses", countKey: "responses" },
  { name: "career_adaptive_answers", countKey: "career_adaptive_answers" },
  { name: "career_adaptive_questions", countKey: "career_adaptive_questions" },
  { name: "career_match_snapshots", countKey: "career_match_snapshots" },
  { name: "t_skills_clarification_answers", countKey: "t_skills_clarification_answers" },
  { name: "t_skills_clarification_questions", countKey: "t_skills_clarification_questions" },
  { name: "t_skills_career_tiebreak_answers", countKey: "t_skills_career_tiebreak_answers" },
  { name: "t_skills_career_results", countKey: "t_skills_career_results" },
  { name: "t_skills_uncertainty_snapshots", countKey: "t_skills_uncertainty_snapshots" },
  { name: "t_skills_narratives", countKey: "t_skills_narratives" },
  { name: "t_skills_trait_profiles", countKey: "t_skills_trait_profiles" },
  { name: "assessment_onboarding", countKey: "onboarding" },
  { name: "adaptive_questions", countKey: "adaptive_questions" },
  { name: "adaptive_runs", countKey: "adaptive_runs" },
  { name: "consents", countKey: "consents" },
  { name: "reports", countKey: "reports" },
  { name: "telemetry_events", countKey: "telemetry" },
] as const;

export function deleteAssessmentDataStatements(database: D1Database, assessmentId: string) {
  return ASSESSMENT_DATA_TABLES.map(({ name }) =>
    database.prepare(`DELETE FROM ${name} WHERE assessment_id = ?`).bind(assessmentId),
  );
}

export function deleteUserAssessmentDataStatements(database: D1Database, userId: string) {
  return ASSESSMENT_DATA_TABLES.map(({ name }) =>
    database
      .prepare(`DELETE FROM ${name} WHERE assessment_id IN (SELECT id FROM assessments WHERE user_id = ?)`)
      .bind(userId),
  );
}

export async function countAssessmentData(database: D1Database, assessmentId: string) {
  const expressions = ASSESSMENT_DATA_TABLES
    .map(({ name, countKey }) => `(SELECT COUNT(*) FROM ${name} WHERE assessment_id = ?) AS ${countKey}`)
    .join(", ");
  const row = await database
    .prepare(`SELECT ${expressions}`)
    .bind(...ASSESSMENT_DATA_TABLES.map(() => assessmentId))
    .first<Record<string, number>>();
  return Object.fromEntries(ASSESSMENT_DATA_TABLES.map(({ countKey }) => [countKey, row?.[countKey] ?? 0]));
}
