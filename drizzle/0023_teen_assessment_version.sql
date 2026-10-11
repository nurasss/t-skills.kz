-- Publish the client-approved T-Skills pathway (75 pairs + 8 situational
-- clarifications + values/subjects). Sessions store their own versions_json,
-- so in-flight t-skills_pairwise_v1 assessments keep their frozen runtime.
INSERT OR IGNORE INTO `career_model_versions`
  (`id`, `version`, `status`, `config_json`, `created_by`, `created_at`, `published_at`)
VALUES
  ('career_model_tskills_teen_v1', 'teen-career-matching-v1', 'PUBLISHED', '{"runtime":"built-in:t-skills-teen-career-v1","catalogVersion":"t-skills-teen-careers-v1"}', 'system_tskills_seed', 1790380800000, 1790380800000);--> statement-breakpoint
UPDATE `assessment_versions`
SET `status` = 'RETIRED', `retired_at` = 1790380800000
WHERE `product_id` = 't-skills' AND `status` = 'PUBLISHED' AND `version` <> 't-skills-teen-v1';--> statement-breakpoint
INSERT OR IGNORE INTO `assessment_versions`
  (`id`, `product_id`, `version`, `status`, `published_at`, `retired_at`, `scoring_version`, `content_version`, `career_model_version`, `report_version`, `adaptive_version`, `item_count`, `metadata_json`, `created_by`, `created_at`)
VALUES
  ('assessment_tskills_teen_v1', 't-skills', 't-skills-teen-v1', 'PUBLISHED', 1790380800000, NULL, 'teen-scoring-v1', 't-skills-teen-items-v1', 'teen-career-matching-v1', 't-skills-teen-report-v1', 'teen-clarification-v1', 100, '{"legacy":false,"normStatus":"unvalidated","pairs":75,"clarifications":8}', NULL, 1790380800000);
