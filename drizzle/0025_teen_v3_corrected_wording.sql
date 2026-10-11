-- Publish corrected teen wording v3 (same 75 pair IDs/traits as v1 source,
-- short statements verbatim from the approved RU/KK DOCX, A left / B right,
-- no balancing swaps). Reuses teen-scoring-v2 (negative = left, positive =
-- right), the v2 report contract and the teen career catalog. Frozen v1/v2
-- sessions keep their own versions_json and are never reinterpreted.
INSERT OR IGNORE INTO `assessment_versions`
  (`id`, `product_id`, `version`, `status`, `published_at`, `retired_at`, `scoring_version`, `content_version`, `career_model_version`, `report_version`, `adaptive_version`, `item_count`, `metadata_json`, `created_by`, `created_at`)
VALUES
  ('assessment_tskills_teen_v3', 't-skills', 't-skills-teen-v3', 'PUBLISHED', 1791105600000, NULL, 'teen-scoring-v2', 't-skills-teen-items-v3', 'teen-career-matching-v1', 't-skills-teen-report-v2', 'teen-clarification-v1', 100, '{"legacy":false,"normStatus":"unvalidated","pairs":75,"clarifications":8,"wording":"corrected-2026-10","leftRightExposure":"docs-verbatim"}', NULL, 1791105600000);--> statement-breakpoint
UPDATE `assessment_versions`
SET `status` = 'RETIRED', `retired_at` = 1791105600000
WHERE `product_id` = 't-skills' AND `status` = 'PUBLISHED' AND `version` <> 't-skills-teen-v3';
