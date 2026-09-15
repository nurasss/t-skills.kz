DROP INDEX `orders_idempotency_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_user_idempotency_unique` ON `orders` (`user_id`,`idempotency_key`);