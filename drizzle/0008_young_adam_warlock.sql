CREATE TABLE `purge_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`status` text NOT NULL,
	`job_version` text NOT NULL,
	`counts_json` text DEFAULT '{}' NOT NULL,
	`error_class` text,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purge_jobs_target_unique` ON `purge_jobs` (`target_id`);--> statement-breakpoint
CREATE INDEX `purge_jobs_status_updated_idx` ON `purge_jobs` (`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `assessments` ADD `purge_state` text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `assessments` ADD `purge_after` integer;--> statement-breakpoint
UPDATE `assessments`
SET `purge_after` = COALESCE(`completed_at`, `updated_at`, `created_at`) + 31536000000
WHERE `purge_after` IS NULL
  AND `state` NOT IN ('CREATED', 'PAYMENT_PENDING', 'PAID', 'CONSENTED', 'CORE_IN_PROGRESS', 'ADAPTIVE_SELECTING', 'ADAPTIVE_IN_PROGRESS', 'SCORING', 'REPORT_GENERATING');--> statement-breakpoint
CREATE INDEX `assessments_purge_due_idx` ON `assessments` (`purge_state`,`purge_after`);
