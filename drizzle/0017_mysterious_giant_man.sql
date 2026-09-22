CREATE TABLE `t_skills_career_results` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`phase` text NOT NULL,
	`candidates_json` text NOT NULL,
	`recommendations_json` text DEFAULT '[]' NOT NULL,
	`career_catalog_version` text NOT NULL,
	`career_matching_version` text NOT NULL,
	`career_tiebreak_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `t_skills_career_results_assessment_idx` ON `t_skills_career_results` (`assessment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `t_skills_career_tiebreak_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`question_id` text NOT NULL,
	`option_id` text NOT NULL,
	`response_time_ms` integer DEFAULT 0 NOT NULL,
	`client_seq` integer NOT NULL,
	`idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `t_skills_career_tiebreak_question_unique` ON `t_skills_career_tiebreak_answers` (`assessment_id`,`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `t_skills_career_tiebreak_idempotency_unique` ON `t_skills_career_tiebreak_answers` (`assessment_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `t_skills_career_tiebreak_assessment_idx` ON `t_skills_career_tiebreak_answers` (`assessment_id`);--> statement-breakpoint
CREATE TABLE `t_skills_clarification_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`question_id` text NOT NULL,
	`response_value` integer NOT NULL,
	`response_time_ms` integer DEFAULT 0 NOT NULL,
	`client_seq` integer NOT NULL,
	`idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `t_skills_clarification_answer_question_unique` ON `t_skills_clarification_answers` (`assessment_id`,`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `t_skills_clarification_answer_idempotency_unique` ON `t_skills_clarification_answers` (`assessment_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `t_skills_clarification_answer_assessment_idx` ON `t_skills_clarification_answers` (`assessment_id`);--> statement-breakpoint
CREATE TABLE `t_skills_clarification_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`question_id` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`selection_reason_json` text DEFAULT '{}' NOT NULL,
	`position` integer NOT NULL,
	`clarification_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `t_skills_clarification_question_unique` ON `t_skills_clarification_questions` (`assessment_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `t_skills_clarification_question_assessment_idx` ON `t_skills_clarification_questions` (`assessment_id`,`position`);--> statement-breakpoint
CREATE TABLE `t_skills_narratives` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text NOT NULL,
	`narrative_prompt_version` text NOT NULL,
	`report_version` text NOT NULL,
	`provider` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `t_skills_narratives_assessment_unique` ON `t_skills_narratives` (`assessment_id`);--> statement-breakpoint
CREATE TABLE `t_skills_trait_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`base_json` text NOT NULL,
	`final_json` text NOT NULL,
	`clarification_answers_json` text DEFAULT '[]' NOT NULL,
	`scoring_version` text NOT NULL,
	`uncertainty_version` text NOT NULL,
	`clarification_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `t_skills_trait_profiles_assessment_unique` ON `t_skills_trait_profiles` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `t_skills_trait_profiles_updated_idx` ON `t_skills_trait_profiles` (`updated_at`);--> statement-breakpoint
CREATE TABLE `t_skills_uncertainty_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`uncertainty_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `t_skills_uncertainty_assessment_idx` ON `t_skills_uncertainty_snapshots` (`assessment_id`,`created_at`);