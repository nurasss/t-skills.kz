-- ORBITA-30 master release: canonical locale storage and assessment locale snapshots.
-- Forward-only migration. Apply once in migration order; rollback is a database
-- restore, not an in-place destructive reverse migration.
ALTER TABLE `assessments` ADD `locale` text DEFAULT 'ru' NOT NULL;
--> statement-breakpoint
UPDATE users SET locale = 'kk' WHERE lower(locale) = 'kz';
--> statement-breakpoint
UPDATE assessments SET locale = 'kk' WHERE lower(locale) = 'kz';
