-- Correct the UI/scorer left-right sign mismatch and balance each trait's
-- display side. Existing teen-v1 sessions keep their frozen legacy scorer.
INSERT OR IGNORE INTO `assessment_versions`
  (`id`, `product_id`, `version`, `status`, `published_at`, `retired_at`, `scoring_version`, `content_version`, `career_model_version`, `report_version`, `adaptive_version`, `item_count`, `metadata_json`, `created_by`, `created_at`)
VALUES
  ('assessment_tskills_teen_v2', 't-skills', 't-skills-teen-v2', 'PUBLISHED', 1791086400000, NULL, 'teen-scoring-v2', 't-skills-teen-items-v2', 'teen-career-matching-v1', 't-skills-teen-report-v2', 'teen-clarification-v1', 100, '{"legacy":false,"normStatus":"unvalidated","pairs":75,"clarifications":8,"leftRightExposure":"3:3"}', NULL, 1791086400000);--> statement-breakpoint
UPDATE `assessment_versions`
SET `status` = 'RETIRED', `retired_at` = 1791086400000
WHERE `product_id` = 't-skills' AND `status` = 'PUBLISHED' AND `version` <> 't-skills-teen-v2';
--> statement-breakpoint
-- v1 attempts that have no final score keep their original item-side layout,
-- but must use the corrected scorer when they resume. Completed scores stay
-- immutable and are surfaced with a legacy-result warning.
INSERT OR IGNORE INTO `assessment_versions`
  (`id`, `product_id`, `version`, `status`, `published_at`, `retired_at`, `scoring_version`, `content_version`, `career_model_version`, `report_version`, `adaptive_version`, `item_count`, `metadata_json`, `created_by`, `created_at`)
VALUES
  ('assessment_tskills_teen_v1_fix', 't-skills', 't-skills-teen-v1-fix', 'RETIRED', 1791086400000, 1791086400000, 'teen-scoring-v2', 't-skills-teen-items-v1', 'teen-career-matching-v1', 't-skills-teen-report-v2', 'teen-clarification-v1', 100, '{"legacy":true,"normStatus":"unvalidated","itemLayout":"teen-v1","scoringFix":"teen-scoring-v2","sessionBridge":true}', NULL, 1791086400000);--> statement-breakpoint
UPDATE `assessments`
SET `versions_json` = json_set(
      `versions_json`,
      '$.assessment', 't-skills-teen-v1-fix',
      '$.scoring', 'teen-scoring-v2',
      '$.report', 't-skills-teen-report-v2'
    ),
    `updated_at` = 1791086400000
WHERE `test_id` = 't-skills'
  AND json_extract(`versions_json`, '$.assessment') = 't-skills-teen-v1'
  AND `final_score_json` IS NULL
  AND `report_id` IS NULL;
