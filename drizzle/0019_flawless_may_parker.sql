CREATE TABLE `admin_role_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`assigned_by` text,
	`created_at` integer NOT NULL,
	`disabled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `admin_roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_role_assignments_active_unique` ON `admin_role_assignments` (`user_id`,`role_id`,`disabled_at`);--> statement-breakpoint
CREATE INDEX `admin_role_assignments_user_idx` ON `admin_role_assignments` (`user_id`,`disabled_at`);--> statement-breakpoint
CREATE TABLE `admin_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_roles_name_unique` ON `admin_roles` (`name`);--> statement-breakpoint
CREATE TABLE `assessment_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`published_at` integer,
	`retired_at` integer,
	`scoring_version` text NOT NULL,
	`content_version` text NOT NULL,
	`career_model_version` text NOT NULL,
	`report_version` text NOT NULL,
	`adaptive_version` text,
	`item_count` integer NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_versions_product_version_unique` ON `assessment_versions` (`product_id`,`version`);--> statement-breakpoint
CREATE INDEX `assessment_versions_status_idx` ON `assessment_versions` (`product_id`,`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `campaign_members` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`entitlement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_members_campaign_user_unique` ON `campaign_members` (`campaign_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `campaign_members_user_idx` ON `campaign_members` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`client_name` text NOT NULL,
	`client_type` text NOT NULL,
	`internal_notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`seat_limit` integer NOT NULL,
	`seat_usage_policy` text DEFAULT 'ONE_PER_USER' NOT NULL,
	`valid_from` integer,
	`valid_until` integer,
	`default_test_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `campaigns_status_idx` ON `campaigns` (`status`,`valid_from`,`valid_until`);--> statement-breakpoint
CREATE INDEX `campaigns_client_idx` ON `campaigns` (`client_name`);--> statement-breakpoint
CREATE TABLE `career_catalog_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`catalog_version` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`title_ru` text NOT NULL,
	`title_kk` text NOT NULL,
	`description_ru` text NOT NULL,
	`description_kk` text NOT NULL,
	`category` text NOT NULL,
	`education_paths_json` text DEFAULT '[]' NOT NULL,
	`work_environment` text DEFAULT '' NOT NULL,
	`career_tags_json` text DEFAULT '[]' NOT NULL,
	`matching_config_json` text DEFAULT '{}' NOT NULL,
	`source_version` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_catalog_entries_version_slug_unique` ON `career_catalog_entries` (`catalog_version`,`slug`);--> statement-breakpoint
CREATE INDEX `career_catalog_entries_status_idx` ON `career_catalog_entries` (`catalog_version`,`status`);--> statement-breakpoint
CREATE TABLE `career_catalog_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_catalog_versions_version_unique` ON `career_catalog_versions` (`version`);--> statement-breakpoint
CREATE TABLE `career_model_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`config_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_model_versions_version_unique` ON `career_model_versions` (`version`);--> statement-breakpoint
CREATE TABLE `content_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`content_key` text NOT NULL,
	`locale` text NOT NULL,
	`current_version` integer DEFAULT 0 NOT NULL,
	`published_version` integer,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_entries_key_locale_unique` ON `content_entries` (`content_key`,`locale`);--> statement-breakpoint
CREATE INDEX `content_entries_locale_idx` ON `content_entries` (`locale`);--> statement-breakpoint
CREATE TABLE `content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`content_key` text NOT NULL,
	`locale` text NOT NULL,
	`version` integer NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`published_by` text,
	`published_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_versions_key_locale_version_unique` ON `content_versions` (`content_key`,`locale`,`version`);--> statement-breakpoint
CREATE INDEX `content_versions_status_idx` ON `content_versions` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`danger` integer DEFAULT 0 NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pricing_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`version` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'CURRENT' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_versions_product_version_unique` ON `pricing_versions` (`product_id`,`version`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`test_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_test_unique` ON `products` (`test_id`);--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`currency` text NOT NULL,
	`max_total_uses` integer,
	`max_uses_per_user` integer,
	`valid_from` integer,
	`valid_until` integer,
	`minimum_order_amount` integer,
	`new_users_only` integer DEFAULT 0 NOT NULL,
	`allowed_test_ids_json` text DEFAULT '[]' NOT NULL,
	`allowed_email_domains_json` text DEFAULT '[]' NOT NULL,
	`allowed_user_ids_json` text DEFAULT '[]' NOT NULL,
	`campaign_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_codes_code_unique` ON `promo_codes` (`code`);--> statement-breakpoint
CREATE INDEX `promo_codes_status_idx` ON `promo_codes` (`status`,`valid_from`,`valid_until`);--> statement-breakpoint
CREATE INDEX `promo_codes_campaign_idx` ON `promo_codes` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `promo_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`promo_code_id` text NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text NOT NULL,
	`campaign_id` text,
	`original_amount_minor` integer NOT NULL,
	`discount_amount_minor` integer NOT NULL,
	`final_amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`redeemed_at` integer NOT NULL,
	`status` text DEFAULT 'REDEEMED' NOT NULL,
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_redemptions_order_unique` ON `promo_redemptions` (`promo_code_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `promo_redemptions_promo_date_idx` ON `promo_redemptions` (`promo_code_id`,`redeemed_at`);--> statement-breakpoint
CREATE INDEX `promo_redemptions_user_idx` ON `promo_redemptions` (`user_id`,`redeemed_at`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `audit_events` ADD `actor_role` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `ip_hash` text;--> statement-breakpoint
ALTER TABLE `entitlements` ADD `promo_code_id` text;--> statement-breakpoint
ALTER TABLE `entitlements` ADD `campaign_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `original_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `final_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `promo_code_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `campaign_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `pricing_snapshot_json` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `idempotency_payload_json` text;--> statement-breakpoint

-- Backfill the immutable pricing contract for all legacy orders before the
-- admin/payment code starts treating amount_minor as the final amount.
UPDATE `orders` SET `original_amount_minor` = `amount_minor` WHERE `original_amount_minor` IS NULL;--> statement-breakpoint
UPDATE `orders` SET `discount_amount_minor` = 0 WHERE `discount_amount_minor` IS NULL;--> statement-breakpoint
UPDATE `orders` SET `final_amount_minor` = `amount_minor` WHERE `final_amount_minor` IS NULL;--> statement-breakpoint

-- Bootstrap the immutable registry without coupling migrations to a particular
-- administrator account. Legacy versions remain queryable, while only the
-- current T-Skills release is selected for new assessments.
INSERT OR IGNORE INTO `admin_roles` (`id`, `name`, `description`, `status`, `created_at`, `updated_at`) VALUES
  ('role_super_admin', 'SUPER_ADMIN', 'Full operational control.', 'ACTIVE', 0, 0),
  ('role_owner', 'OWNER', 'Business owner controls.', 'ACTIVE', 0, 0),
  ('role_content_manager', 'CONTENT_MANAGER', 'Website and content controls.', 'ACTIVE', 0, 0),
  ('role_support', 'SUPPORT', 'User support controls.', 'ACTIVE', 0, 0),
  ('role_finance', 'FINANCE', 'Orders and payment controls.', 'ACTIVE', 0, 0),
  ('role_analyst', 'ANALYST', 'Aggregate analytics access.', 'ACTIVE', 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO `assessment_versions`
  (`id`, `product_id`, `version`, `status`, `published_at`, `retired_at`, `scoring_version`, `content_version`, `career_model_version`, `report_version`, `adaptive_version`, `item_count`, `metadata_json`, `created_by`, `created_at`)
VALUES
  ('assessment_tskills_pairwise_v1', 't-skills', 't-skills_pairwise_v1', 'PUBLISHED', 0, NULL, 'pairwise-scoring-v1', 't-skills-pairwise-items-v1', 'career-matching-v1', 't-skills-report-v1', 'career-adaptive-v1', 75, '{"legacy":false,"normStatus":"unvalidated"}', NULL, 0),
  ('assessment_orbita30_v1', 'orbita30', 'orbita30_ru_v1', 'ARCHIVED', NULL, NULL, 'mvp-0.4-norm-safe', 'draft-pilot-v1', 'legacy', 'report-0.3', 'selector-0.3', 300, '{"legacy":true}', NULL, 0),
  ('assessment_orbita30_v2', 'orbita30', 'orbita30_ru_v2', 'RETIRED', NULL, NULL, 'mvp-0.5-core60', 'core60-v1', 'legacy', 'report-0.4', 'mercury-generated-0.1', 60, '{"legacy":true}', NULL, 0);
