CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`assessment_id` text NOT NULL,
	`consent_type` text NOT NULL,
	`text_version` text NOT NULL,
	`granted` integer NOT NULL,
	`decided_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consents_assessment_type_unique` ON `consents` (`assessment_id`,`consent_type`);--> statement-breakpoint
CREATE INDEX `consents_user_type_idx` ON `consents` (`user_id`,`consent_type`,`decided_at`);