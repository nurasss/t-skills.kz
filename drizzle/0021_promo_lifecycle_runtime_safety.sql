DROP INDEX `admin_role_assignments_active_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `admin_role_assignments_one_active_unique` ON `admin_role_assignments` (`user_id`,`role_id`) WHERE "admin_role_assignments"."disabled_at" IS NULL;--> statement-breakpoint
ALTER TABLE `promo_redemptions` ADD `reserved_at` integer;--> statement-breakpoint
ALTER TABLE `promo_redemptions` ADD `reservation_expires_at` integer;--> statement-breakpoint
ALTER TABLE `promo_redemptions` ADD `released_at` integer;--> statement-breakpoint
CREATE INDEX `promo_redemptions_reservation_idx` ON `promo_redemptions` (`promo_code_id`,`status`,`reservation_expires_at`);--> statement-breakpoint
UPDATE `promo_redemptions`
SET `reserved_at` = `redeemed_at`
WHERE `reserved_at` IS NULL;--> statement-breakpoint
UPDATE `campaigns`
SET `seat_usage_policy` = 'ONE_PER_USER'
WHERE `seat_usage_policy` <> 'ONE_PER_USER';--> statement-breakpoint

-- Bootstrap records are owned by a disabled internal identity so migrations
-- remain reproducible before the first human owner is invited.
INSERT OR IGNORE INTO `users`
  (`id`, `email`, `full_name`, `role`, `status`, `locale`, `created_at`, `updated_at`, `deleted_at`)
VALUES
  ('system_tskills_seed', 'system@t-skills.invalid', 'T-Skills system seed', 'user', 'blocked', 'ru', 0, 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO `career_model_versions`
  (`id`, `version`, `status`, `config_json`, `created_by`, `created_at`, `published_at`)
VALUES
  ('career_model_tskills_v1', 'career-matching-v1', 'PUBLISHED', '{"runtime":"built-in:t-skills-career-v1","catalogVersion":"t-skills-career-catalog-v1"}', 'system_tskills_seed', 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO `career_catalog_versions`
  (`id`, `version`, `status`, `created_by`, `created_at`, `published_at`)
VALUES
  ('career_catalog_tskills_v1', 't-skills-career-catalog-v1', 'PUBLISHED', 'system_tskills_seed', 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO `career_catalog_entries`
  (`id`, `catalog_version`, `slug`, `status`, `title_ru`, `title_kk`, `description_ru`, `description_kk`, `category`, `education_paths_json`, `work_environment`, `career_tags_json`, `matching_config_json`, `source_version`, `created_by`, `created_at`, `updated_at`)
VALUES
  ('career_seed_data_analyst', 't-skills-career-catalog-v1', 'data-analyst', 'ACTIVE', 'Аналитик данных', 'Деректер талдаушысы', 'Исследует данные, формулирует выводы и превращает наблюдения в проверяемые решения.', 'Деректерді зерттеп, қорытынды жасап, байқауларды тексерілетін шешімдерге айналдырады.', 'Аналитика', '["Аналитика данных","Статистика","Прикладная математика"]', 'Работа с данными, гипотезами и понятными критериями качества.', '["математика","информатика","физика"]', '{}', 'seed-v1', 'system_tskills_seed', 0, 0),
  ('career_seed_software_engineer', 't-skills-career-catalog-v1', 'software-engineer', 'ACTIVE', 'Инженер-разработчик', 'Бағдарламалық жасақтама инженері', 'Проектирует и создаёт надёжные цифровые решения, проверяя детали и связи в системе.', 'Жүйедегі бөлшектер мен байланыстарды тексеріп, сенімді цифрлық шешімдерді жобалайды және жасайды.', 'Технологии', '["Программная инженерия","Компьютерные науки","Информационные системы"]', 'Сложные системы, самостоятельная работа и последовательное улучшение результата.', '["информатика","математика","физика"]', '{}', 'seed-v1', 'system_tskills_seed', 0, 0),
  ('career_seed_product_manager', 't-skills-career-catalog-v1', 'product-manager', 'ACTIVE', 'Продуктовый менеджер', 'Өнім менеджері', 'Соединяет потребности людей, цели продукта и работу команды в ясное направление.', 'Адамдардың қажеттіліктерін, өнім мақсатын және команда жұмысын айқын бағытқа біріктіреді.', 'Продукт', '["Менеджмент","Экономика","Информационные системы"]', 'Неопределённость, решения на стыке пользователей, бизнеса и команды.', '["экономика","информатика","общество"]', '{}', 'seed-v1', 'system_tskills_seed', 0, 0),
  ('career_seed_ux_researcher', 't-skills-career-catalog-v1', 'ux-researcher', 'ACTIVE', 'UX-исследователь', 'UX-зерттеуші', 'Изучает опыт людей, замечает закономерности и помогает команде принимать решения на фактах.', 'Адамдардың тәжірибесін зерттеп, заңдылықтарды байқайды және командаға фактілермен шешім қабылдауға көмектеседі.', 'Исследования', '["Психология","Социология","Дизайн и исследования"]', 'Интервью, наблюдения, анализ поведения и объяснение выводов команде.', '["биология","общество","языки"]', '{}', 'seed-v1', 'system_tskills_seed', 0, 0),
  ('career_seed_project_coordinator', 't-skills-career-catalog-v1', 'project-coordinator', 'ACTIVE', 'Координатор проектов', 'Жоба үйлестірушісі', 'Организует людей, сроки и договорённости так, чтобы совместная работа двигалась к результату.', 'Адамдарды, мерзімдерді және келісімдерді үйлестіріп, ортақ жұмысты нәтижеге жеткізеді.', 'Управление', '["Управление проектами","Менеджмент","Бизнес-администрирование"]', 'Командные процессы, планы, ответственность и согласование действий.', '["экономика","общество","математика"]', '{}', 'seed-v1', 'system_tskills_seed', 0, 0);--> statement-breakpoint
