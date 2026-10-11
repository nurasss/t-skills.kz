CREATE TABLE `campaign_seat_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text NOT NULL,
	`checkout_session_id` text,
	`status` text DEFAULT 'RESERVED' NOT NULL,
	`reserved_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_at` integer,
	`released_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_seat_reservations_order_unique` ON `campaign_seat_reservations` (`order_id`);--> statement-breakpoint
CREATE INDEX `campaign_seat_reservations_campaign_status_idx` ON `campaign_seat_reservations` (`campaign_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `campaign_seat_reservations_user_campaign_idx` ON `campaign_seat_reservations` (`user_id`,`campaign_id`);--> statement-breakpoint
CREATE INDEX `campaign_seat_reservations_checkout_session_idx` ON `campaign_seat_reservations` (`checkout_session_id`);