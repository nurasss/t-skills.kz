DROP INDEX `adaptive_runs_assessment_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_runs_assessment_unique` ON `adaptive_runs` (`assessment_id`);