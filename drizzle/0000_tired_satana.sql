CREATE TABLE `assessment_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`item_id` text NOT NULL,
	`response` integer NOT NULL,
	`response_time_ms` integer DEFAULT 0 NOT NULL,
	`client_seq` integer NOT NULL,
	`idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_responses_item_unique` ON `assessment_responses` (`assessment_id`,`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_responses_idempotency_unique` ON `assessment_responses` (`assessment_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `assessment_responses_assessment_idx` ON `assessment_responses` (`assessment_id`);--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`test_id` text NOT NULL,
	`state` text NOT NULL,
	`versions_json` text NOT NULL,
	`adaptive_item_ids_json` text DEFAULT '[]' NOT NULL,
	`selection_mode` text,
	`preliminary_score_json` text,
	`final_score_json` text,
	`report_id` text,
	`client_seq` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`consented_at` integer,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assessments_user_updated_idx` ON `assessments` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `assessments_state_idx` ON `assessments` (`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_report_unique` ON `assessments` (`report_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`user_id` text NOT NULL,
	`test_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_order_unique` ON `entitlements` (`order_id`);--> statement-breakpoint
CREATE INDEX `entitlements_user_status_idx` ON `entitlements` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`test_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`provider_checkout_id` text,
	`provider_payment_id` text,
	`provider_event_id` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_user_status_idx` ON `orders` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `orders_provider_checkout_idx` ON `orders` (`provider_checkout_id`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`payload_hash` text NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_events_order_idx` ON `payment_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `privacy_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `privacy_requests_user_idx` ON `privacy_requests` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`score_json` text NOT NULL,
	`report_json` text,
	`pdf_key` text,
	`provider` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_assessment_unique` ON `reports` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `reports_user_updated_idx` ON `reports` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `telemetry_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text,
	`assessment_id` text,
	`metadata_json` text,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `telemetry_events_name_time_idx` ON `telemetry_events` (`name`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `telemetry_events_assessment_idx` ON `telemetry_events` (`assessment_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text,
	`locale` text DEFAULT 'ru' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);