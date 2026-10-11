-- Publish teen catalog-111 revision v4 for new sessions (same 75 pairs,
-- layout, scorer, clarification selection, report shape and career formula
-- as v3; profession catalog t-skills-teen-careers-v2 with 111 entries).
-- Retires the previously published version for new users. Existing
-- assessments keep their own versions_json, answers, snapshots, reports and
-- PDFs; unfinished old sessions continue on their own contract and the 170
-- catalog. No rows besides assessment_versions are touched.
INSERT OR IGNORE INTO `assessment_versions`
  (`id`, `product_id`, `version`, `status`, `published_at`, `retired_at`, `scoring_version`, `content_version`, `career_model_version`, `report_version`, `adaptive_version`, `item_count`, `metadata_json`, `created_by`, `created_at`)
VALUES
  ('assessment_tskills_teen_v4', 't-skills', 't-skills-teen-v4', 'PUBLISHED', 1791187200000, NULL, 'teen-scoring-v2', 't-skills-teen-items-v4', 'teen-career-matching-v1', 't-skills-teen-report-v2', 'teen-clarification-v1', 100, '{"legacy":false,"normStatus":"unvalidated","pairs":75,"clarifications":8,"wording":"corrected-2026-10","leftRightExposure":"docs-verbatim","careers":111,"careerCatalog":"t-skills-teen-careers-v2"}', NULL, 1791187200000);--> statement-breakpoint
UPDATE `assessment_versions`
SET `status` = 'RETIRED', `retired_at` = 1791187200000
WHERE `product_id` = 't-skills' AND `status` = 'PUBLISHED' AND `version` <> 't-skills-teen-v4';
