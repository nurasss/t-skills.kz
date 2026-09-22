CREATE TABLE `t_skills_professions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`trait_weights_json` text NOT NULL,
	`subject_tags_json` text DEFAULT '[]' NOT NULL,
	`dimensions_json` text DEFAULT '{}' NOT NULL,
	`rules_json` text DEFAULT '[]' NOT NULL,
	`roadmap_json` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`version` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `t_skills_professions_active_version_idx` ON `t_skills_professions` (`active`,`version`);--> statement-breakpoint
CREATE INDEX `t_skills_professions_updated_idx` ON `t_skills_professions` (`updated_at`);