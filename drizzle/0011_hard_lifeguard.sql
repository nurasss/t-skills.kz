CREATE TABLE `adaptive_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`question_id` text NOT NULL,
	`format` text NOT NULL,
	`prompt` text NOT NULL,
	`options_json` text DEFAULT '[]' NOT NULL,
	`target_traits_json` text DEFAULT '[]' NOT NULL,
	`reason_code` text NOT NULL,
	`semantic_intent` text NOT NULL,
	`semantic_cluster` text NOT NULL,
	`confidence` real,
	`provider` text NOT NULL,
	`model_id` text,
	`provider_request_id` text,
	`prompt_version` text NOT NULL,
	`adaptive_version` text NOT NULL,
	`validation_status` text NOT NULL,
	`question_hash` text NOT NULL,
	`generated_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adaptive_questions_assessment_question_unique` ON `adaptive_questions` (`assessment_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `adaptive_questions_assessment_idx` ON `adaptive_questions` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `adaptive_questions_cluster_idx` ON `adaptive_questions` (`semantic_cluster`);--> statement-breakpoint
ALTER TABLE `adaptive_runs` ADD `prompt_version` text DEFAULT 'mercury-adaptive-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `adaptive_runs` ADD `adaptive_version` text DEFAULT 'mercury-generated-0.1' NOT NULL;--> statement-breakpoint
ALTER TABLE `adaptive_runs` ADD `provider_request_id` text;--> statement-breakpoint
ALTER TABLE `adaptive_runs` ADD `attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `adaptive_runs` ADD `prompt_tokens` integer;--> statement-breakpoint
ALTER TABLE `adaptive_runs` ADD `output_tokens` integer;--> statement-breakpoint
ALTER TABLE `adaptive_runs` ADD `generated_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `assessment_responses` ADD `response_source` text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE `assessments` ADD `adaptive_generation_status` text DEFAULT 'NOT_STARTED' NOT NULL;--> statement-breakpoint
ALTER TABLE `assessments` ADD `adaptive_provider` text;--> statement-breakpoint
ALTER TABLE `assessments` ADD `adaptive_model` text;--> statement-breakpoint
ALTER TABLE `assessments` ADD `adaptive_prompt_version` text;--> statement-breakpoint
ALTER TABLE `assessments` ADD `adaptive_generated_at` integer;--> statement-breakpoint
ALTER TABLE `assessments` ADD `adaptive_fallback_used` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `assessments` ADD `adaptive_generation_lock` integer DEFAULT 0 NOT NULL;