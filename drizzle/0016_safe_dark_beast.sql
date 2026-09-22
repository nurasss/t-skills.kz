CREATE TABLE `assessment_onboarding` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`age` integer NOT NULL,
	`education_level` text NOT NULL,
	`favorite_subjects_json` text NOT NULL,
	`extensions_json` text DEFAULT '{}' NOT NULL,
	`version` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_onboarding_assessment_unique` ON `assessment_onboarding` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `assessment_onboarding_user_idx` ON `assessment_onboarding` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `career_adaptive_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`question_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`response_time_ms` integer DEFAULT 0 NOT NULL,
	`client_seq` integer NOT NULL,
	`idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_adaptive_answers_assessment_question_unique` ON `career_adaptive_answers` (`assessment_id`,`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `career_adaptive_answers_idempotency_unique` ON `career_adaptive_answers` (`assessment_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `career_adaptive_answers_assessment_idx` ON `career_adaptive_answers` (`assessment_id`);--> statement-breakpoint
CREATE TABLE `career_adaptive_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`question_id` text NOT NULL,
	`prompt` text NOT NULL,
	`options_json` text NOT NULL,
	`rationale_internal` text,
	`source` text NOT NULL,
	`provider` text,
	`model_id` text,
	`prompt_version` text NOT NULL,
	`adaptive_version` text NOT NULL,
	`validation_status` text NOT NULL,
	`question_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_adaptive_questions_assessment_question_unique` ON `career_adaptive_questions` (`assessment_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `career_adaptive_questions_assessment_idx` ON `career_adaptive_questions` (`assessment_id`);--> statement-breakpoint
CREATE TABLE `career_match_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`phase` text NOT NULL,
	`candidates_json` text NOT NULL,
	`matching_version` text NOT NULL,
	`career_catalog_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `career_match_snapshots_assessment_idx` ON `career_match_snapshots` (`assessment_id`,`created_at`);