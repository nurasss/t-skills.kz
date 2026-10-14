-- Publish teen accuracy revision v5 for new sessions: same 75 pair texts,
-- situational bank and 111-profession catalog as v4, but balanced 3:3
-- left/right layout (t-skills-teen-items-v5), graph-based scoring
-- (teen-scoring-v3) and weight-norm-fair matching (teen-career-matching-v2).
-- Retires the previously published version for new users. Existing
-- assessments keep their own versions_json, answers, snapshots, reports and
-- PDFs; unfinished v4 sessions continue on the v4 contract. No rows besides
-- assessment_versions are touched.
INSERT OR IGNORE INTO `assessment_versions`
  (`id`, `product_id`, `version`, `status`, `published_at`, `retired_at`, `scoring_version`, `content_version`, `career_model_version`, `report_version`, `adaptive_version`, `item_count`, `metadata_json`, `created_by`, `created_at`)
VALUES
  ('assessment_tskills_teen_v5', 't-skills', 't-skills-teen-v5', 'PUBLISHED', 1792022400000, NULL, 'teen-scoring-v3', 't-skills-teen-items-v5', 'teen-career-matching-v2', 't-skills-teen-report-v2', 'teen-clarification-v1', 100, '{"legacy":false,"normStatus":"unvalidated","pairs":75,"clarifications":8,"wording":"corrected-2026-10","leftRightExposure":"balanced-3-3","scoring":"graph-ridge-ls","stage2Weight":1,"matching":"weight-norm","careers":111,"careerCatalog":"t-skills-teen-careers-v2"}', NULL, 1792022400000);--> statement-breakpoint
UPDATE `assessment_versions`
SET `status` = 'RETIRED', `retired_at` = 1792022400000
WHERE `product_id` = 't-skills' AND `status` = 'PUBLISHED' AND `version` <> 't-skills-teen-v5';
