CREATE TABLE `rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_updated_idx` ON `rate_limits` (`updated_at`);