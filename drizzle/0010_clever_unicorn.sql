PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`user_id` text NOT NULL,
	`test_id` text NOT NULL,
	`grant_source` text DEFAULT 'stripe' NOT NULL,
	`grant_reference` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_entitlements`("id", "order_id", "user_id", "test_id", "grant_source", "grant_reference", "status", "created_at", "revoked_at") SELECT "id", "order_id", "user_id", "test_id", 'stripe', 'stripe:' || "order_id", "status", "created_at", "revoked_at" FROM `entitlements`;--> statement-breakpoint
DROP TABLE `entitlements`;--> statement-breakpoint
ALTER TABLE `__new_entitlements` RENAME TO `entitlements`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_order_unique` ON `entitlements` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_grant_reference_unique` ON `entitlements` (`grant_reference`);--> statement-breakpoint
CREATE INDEX `entitlements_user_status_idx` ON `entitlements` (`user_id`,`status`);--> statement-breakpoint
ALTER TABLE `consents` ADD `privacy_notice_version` text DEFAULT 'privacy-2026-09' NOT NULL;--> statement-breakpoint
ALTER TABLE `consents` ADD `purpose` text DEFAULT 'developmental-assessment' NOT NULL;
