ALTER TABLE `assessments` ADD `entitlement_id` text REFERENCES entitlements(id);--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_entitlement_unique` ON `assessments` (`entitlement_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `provider_checkout_url` text;--> statement-breakpoint
ALTER TABLE `privacy_requests` ADD `artifact_key` text;