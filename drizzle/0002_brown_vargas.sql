CREATE TABLE `adaptive_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`selector_version` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text,
	`input_hash` text NOT NULL,
	`output_hash` text NOT NULL,
	`chosen_ids_json` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`validation_result` text NOT NULL,
	`fallback_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `adaptive_runs_assessment_idx` ON `adaptive_runs` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `adaptive_runs_created_idx` ON `adaptive_runs` (`created_at`);--> statement-breakpoint
ALTER TABLE `reports` ADD `prompt_version` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `model_id` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `input_hash` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `output_hash` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `validation_result` text;