# Аудит T-Skills

Дата аудита: 2026-09-17  
Область: приложение, интерфейс, API, D1/R2-хранилище, аутентификация, privacy/legal, SEO, accessibility, зависимости и локальные release-гates.

## Вывод

Проект приведён к состоянию инженерно готового закрытого beta-пилота: у него есть серверная граница пользователя, versioned consent, owner-scoped доступ к данным, безопасная выдача PDF, детерминированный scoring, fallback для внешних провайдеров, retention/delete/export, legal/SEO-страницы и проверяемые QA-гейты.

Публичный production launch не следует считать разрешённым до заполнения реальных реквизитов и секретов, проверки текстов юристом по праву Республики Казахстан, MFA для администраторов, внешнего security review и повторной проверки развёрнутых Workers/D1/R2.

## Сильные стороны

1. Доменная логика отделена от UI. Контроллер, presentation views, API/queue, scoring, payment и retention находятся в отдельных границах. Это снижает риск, что браузерный код сможет сам изменить score, entitlement или владельца объекта.
2. Score и report детерминированы и версионируются. Mercury/OpenAI не являются источником истины для чисел, а внешние ответы проходят строгую схему, allowlist смыслов и fallback.
3. Доступ к assessment, order, report, PDF, export и delete проверяется по серверному `user_id`; ID из URL не считаются полномочием.
4. D1 хранит только хэши session/auth tokens, пароли хешируются серверным PBKDF2-HMAC-SHA-256 с индивидуальной солью, сессии можно отозвать, парольный сброс и подтверждение e-mail одноразовые.
5. State-changing API имеют origin/Fetch Metadata/CSRF-проверки, строгие Zod-схемы, лимиты размера тела, rate limiting, idempotency и безопасные публичные ошибки. Permissive CORS не включён.
6. R2-артефакты приватны; PDF выдаётся короткой owner-bound ссылкой, а удаление сначала убирает файл, затем D1-записи.
7. Логи и telemetry allowlisted: в них не должны попадать сырые ответы, e-mail, секреты и произвольный provider payload. Админские метрики агрегированы.
8. UX покрывает 404, loading/error-состояния, thank-you, sticky mobile CTA, мобильное меню, focus-visible, клавиатурную навигацию, явные labels, consent и доступные alert/status-сообщения.
9. SEO-основа закрыта: title/description на страницах, favicon, robots.txt, sitemap.xml, Open Graph image и canonical metadata.
10. Недостоверный social proof и необоснованные claims удалены. В интерфейсе явно указано, что item bank — pilot/draft, norm status — `unvalidated`, а результат не предназначен для клинических, кадровых или иных high-stakes решений.

## Недостатки, найденные до исправлений, и разбор риска

| Приоритет | Найденная проблема | Почему это риск | Решение в текущем worktree |
|---|---|---|---|
| P0 | Не было самостоятельного application login/access boundary | Пользовательские данные нельзя безопасно разделять между участниками | D1-backed e-mail/password, verification, reset, opaque sessions, logout и role-gated admin |
| P0 | API и внутренние маршруты требовали усиления ownership/CSRF/rate limit | Подстановка ID, CSRF и brute force могли привести к утечке или злоупотреблению | async session verifier, owner predicates, same-origin/CSRF, fixed-window limits и API schema validation |
| P0 | Секреты и deployment values не имели единого launch-gate | Ключ мог попасть в bundle/Git или приложение могло стартовать с небезопасной конфигурацией | server-only env, secret scan с проверкой Git history, отдельные staging/prod bindings, fail-closed config check |
| P0 | Не было полноценного lifecycle для account data | Нельзя было доказать удаление, экспорт, retention и приватность файлов | versioned D1 schema, export/delete workflows, private R2, retention cron, backup/restore smoke |
| P1 | Отсутствовали privacy/terms/cookies/refunds/contact и consent audit trail | Непрозрачные цели обработки, cookies и возвраты создают правовой и продуктовый риск | `/privacy`, `/terms`, `/cookies`, `/refunds`, `/contact`, versioned consent и env-driven legal config |
| P1 | Реальные реквизиты и sender нельзя было безопасно угадать | Вымышленный оператор/адрес создаёт ложное юридическое заявление | Добавлены явные placeholders и deployment blocker; `security.txt` работает только с реальным contact email |
| P1 | Не было безопасной границы аналитики | Трекинг мог собирать лишние поля или включить стороннего провайдера без согласия | first-party aggregate telemetry, metadata allowlist; сторонняя analytics не загружается |
| P1 | Не хватало технической SEO/accessibility базы | Плохая индексация, keyboard trap, слабый контраст и неясные формы ухудшают доступность и доверие | metadata, 404, robots/sitemap/OG/favicon, alt/декоративные SVG, contrast/focus/keyboard/mobile QA |
| P1 | В UI были фейковые отзывы и сильные claims без доказательств | Это вводит пользователя в заблуждение и повышает legal/reputation risk | social proof удалён, claims приведены к pilot/unvalidated формулировкам |
| P2 | В starter оставались неиспользуемые UI-компоненты и зависимости | Лишняя поверхность атаки, bundle и maintenance cost | Удалены неиспользуемые starter-файлы и runtime dependencies; depcheck чистый |
| P1 | Повторные/параллельные запросы могли быть опасны для ответов и auth tokens | Дубликаты или повторное использование токена ломают целостность состояния | bounded idempotency, optimistic sequence, atomic token consumption и race tests |

## Что сделано

- Добавлена первая-party auth-система в `app/auth/` и `lib/app-auth.ts`: регистрация по приглашению, пароль, e-mail verification, reset, logout, secure cookie, CSRF cookie, revocation.
- Админские страницы и API закрыты ролью `admin` или серверным allowlist; client input не может назначить себе роль.
- `lib/password.ts` использует PBKDF2-HMAC-SHA-256 с 600 000 итераций и random salt. Это совместимо с Web Crypto в Workers; перед public launch стоит отдельно принять решение о миграции на Argon2id/scrypt и MFA.
- Потребление verification/reset token теперь связывается с отдельным одноразовым nonce (`auth_tokens.consumption_nonce`), поэтому совпадение миллисекундных timestamp не позволяет параллельному запросу изменить пароль или подтвердить другой аккаунт.
- Все формы валидируются на сервере, payload ограничен по размеру, произвольные поля отбрасываются. В React нет `dangerouslySetInnerHTML`, `innerHTML`, `<img>` без alt или внешнего трекера.
- Добавлены CSP nonce, HSTS, nosniff, frame denial, Referrer-Policy, COOP/CORP, Permissions-Policy и request IDs.
- Опциональный OpenAI endpoint ограничен официальным HTTPS-хостом `api.openai.com`; произвольный compatible endpoint отклоняется и переводит отчёт/адаптивный выбор на безопасный fallback.
- Для pre-auth login/register/reset/verification/logout включена обязательная CSRF-проверка; тела JSON и Stripe webhook читаются потоково с жёстким byte-limit до буферизации.
- Production session verifier принимает только Secure `__Host-orbita_session`; legacy non-Secure cookie оставлена исключительно для local preview.
- Добавлены legal pages, cookie banner с необходимыми cookies по умолчанию, независимые research/marketing opt-in и правила возврата без выдуманных обязательств.
- Изображения сведены к собственным SVG-ассетам `public/favicon.svg` и `public/og.svg`; внешние raster-файлы и неизвестные лицензии не используются.
- Dependency tree очищен; обновлены `lucide-react` и `fast-check`. Playwright оставлен на `1.61.0`, потому что Playwright 1.63 не поддерживает macOS 13 в текущей среде; тестовый Chromium установлен и браузерный тест проходит.

## Проверка результата

Результаты обновлены 2026-10-04 на Node `22.13.0`:

- `npm ci`, lint, TypeScript, `npm test` (184/184), `npm run test:coverage` (84.82% branch), production build и Node/VPS build — PASS.
- CSP, contrast (22 пары, минимум `4.57`), prompt validation, dependency/dead-code checks, bundle limit, migration drift и retention query plan — PASS.
- Browser (2/2: CSP/hydration и полный Teen client flow с PDF), isolated Worker/D1/R2 E2E (активный teen-поток 75+8 до сохранённого отчёта, поздний async payment после локального TTL, partial/full refund, late paid after refund, refund CSRF/missing-key, admin capacity metrics и потоковый лимит Teen PDF), beta-free smoke, concurrent load (`error_rate=0`, `lost=0`, `duplicated=0`), backup/restore и 4 PDF fixtures по 24 страницы — PASS.
- `npm run security:scan` — PASS; `npm audit --omit=dev --audit-level=moderate` — 0 уязвимостей.
- Полный `npm audit --audit-level=moderate` — FAIL: 10 dependency-path findings для одного high severity CVE `GHSA-vfj7-8cjw-p6xm` в dev-only `braces@3.0.3` chain. Исправленного upstream release нет; см. [GitHub Advisory](https://github.com/advisories/ghsa-vfj7-8cjw-p6xm) и открытый [upstream fix PR #72](https://github.com/micromatch/braces/pull/72).
- `npm run deploy:config-check` — FAIL: отсутствует `EMAIL_FROM` для staging. `npm run release:verify` — PASS для исторического commit `2c8b65b…` после восстановления Git history; текущие dirty changes этим архивом не покрыты.
- `npm run check:gates` — все статусы readiness `NO`; рабочее дерево не чистое и hosted CI для этого снимка не подтверждён.

Новые дефекты, исправленные в этом аудите:

- Отключённый checkout возвращал `403` в одной ветке и `503` в другой и терял понятное сообщение. Ветви сведены к `503`, а отказ до создания Stripe-сессии теперь помечает заказ failed и освобождает бронь. E2E проверяет отсутствующий Stripe secret.
- Локальный TTL освобождал промокод/место кампании до прихода позднего async webhook. Бронь с прикреплённой provider-сессией теперь учитывается до терминального подписанного события; просроченный заказ без сессии по-прежнему очищается. E2E проверяет hold, поздний success и campaign/promo admin counters.
- Список кампаний и админский обзор не вычитали session-backed брони из доступной ёмкости. Сводки кампаний, промокодов и health panel теперь показывают held capacity и просроченные брони.
- `/api/teen/pdf` ранее читал body целиком до проверки лимита и принимал неограниченные career/text arrays. Маршрут использует streaming byte limit, валидирует опубликованный versioned content, ограничивает массивы/тексты и возвращает 400/422 для некорректного payload; E2E проверяет chunked body, а браузерный тест проходит полный Teen flow и скачивание PDF.
- Клиент `/teen` применял незаверсионированные 20 вопросов Stage 3b при серверном контракте 75+8. Stage 3b остаётся выключен до отдельной версии скоринга/отчёта; browser smoke закрепляет контракт.
- В `t-skills-teen-v1` интерфейс отправлял отрицательное значение при выборе левого утверждения, а scorer прибавлял его левому качеству. Регрессионный тест теперь проверяет UI-sign mapping. `t-skills-teen-v2` использует исправленный scorer и раскладку 3 left/3 right на каждое качество; миграция переводит только незавершённые v1-сессии на internal bridge с исходной раскладкой и исправленным scoring.
- Для завершённых v1-оценок результат задним числом не меняется; страница результата и новые PDF показывают предупреждение. Непроверенный ±8 интервал и se 0.42 заменены полным пределом индекса и `se=1`; UI/PDF обозначают их как некалиброванные, а не как статистическую точность.
- Провёл содержательное ревью всех 75 пар и ситуационного пула, оформил замечания в `TEEN_ASSESSMENT_REVIEW.md`. Формулировки пула не переписывал без когнитивных интервью: остались socially desirable ступени ответов, смешение конструктов и отдельные неудачные сценарии.
- Возврат заказа не включал обязательную CSRF-ветку, допускал параллельный запуск возвратов и помечал любой Stripe refund event полным возвратом. Добавлены атомарный захват заказа, чтение refund-списка Stripe с суммированием только успешных операций, частичные/pending/failed статусы, проверки суммы/валюты, обработка позднего PAID без повторной выдачи доступа и удаление участника кампании при полном возврате.
- Последнего `SUPER_ADMIN` можно было снять двумя конкурентными запросами; ограничение теперь выполняется атомарно в SQL. Аудит больше не хеширует IP с предсказуемой fallback-солью, если managed secret отсутствует.
- FAQ в CMS нельзя было опубликовать: обязательный заголовок отсутствовал в схеме и редакторе. Добавил поле заголовка, проверку актуальной версии перед публикацией и optimistic concurrency для CMS/цен; публикация assessment-версии обновляет целевой статус до архивации предыдущей версии.
- Повторный admin refund не учитывал уже возвращённые суммы Stripe. Теперь перед запросом сервер постранично сверяет Charge/PaymentIntent refunds, блокирует незавершённые операции, отправляет только остаток и сохраняет доступ до подтверждённого полного возврата.
- Admin health не отражал pending refund поверх уже частично возвращённого заказа и не считал provider `refund.failed`. Метрики теперь учитывают незавершённые refund events и дедуплицируют ошибки по заказу.
- Preview identity, rate-limit fallback, email suppression и retention fault injection расходились между `APP_ENV` и `ORBITA_ENV`; неверный HTTP `APP_BASE_URL` мог ослабить session cookie. Локальные ветви теперь разрешаются только когда все заданные markers локальные; вне local cookie всегда Secure, а production/local конфликт fail-closed.
- Read-only production GET обнаружил на `t-skills.kz` неподтверждённые legal-реквизиты и открытую индексацию. 2026-10-04 на `kz-vps` развёрнут image `a2f14aafdb22…`: v1 retired, v2 published; intake, checkout и индексация остаются закрыты legal-gate. Health/catalog/robots проверены. Migration 0024 перевела одну незавершённую v1-сессию в исправленный v1-fix bridge; завершённые старые результаты не переписывались и помечены предупреждением. Полные hashes, восстановительные снимки и корректный откат отражены в `DEPLOYMENT_EVIDENCE.md`. Юридическое одобрение не подменялось и остаётся открытым.

## Остаточные риски и обязательные действия до запуска

1. Заполнить реальные `LEGAL_*`, `SUPPORT_CONTACT`, `SECURITY_CONTACT_EMAIL`, `EMAIL_FROM` и другие operator values. Подписанный `LEGAL_LAUNCH_APPROVAL.md` предшествует `LEGAL_DOCUMENTS_APPROVED=true`; сейчас `npm run deploy:config-check` останавливается на `DEPLOY_CONFIG_EMAIL_FROM_MISSING:staging`.
2. Проверить Privacy/Terms/Cookies/Refunds юристом и утвердить оператора, адрес, юрисдикцию, цели, категории, сроки, processors, трансграничную обработку, порядок отзыва и коммерческие условия.
3. Настроить Resend verified sender, отдельные staging/prod secrets, WAF/CDN, alerting, backup RPO/RTO и incident/on-call контакты. Не переносить значения из `.env.example` в production.
4. Добавить MFA для администраторов и провести внешний penetration test с повторной проверкой исправлений.
5. Применить миграции `0000`–`0024` к правильным изолированным D1 environments и выполнить authenticated hosted smoke для точного текущего source commit.
6. Не включать Stripe/payment и Mercury/OpenAI в production beta до утверждения цены, webhook, processor disclosure и операционного процесса возвратов.
7. Не публиковать normative percentile, clinical, IQ, hiring или иные high-stakes claims до независимой psychometric validation, fairness/DIF, reliability, validity и norms work.

## Юридическая рамка

Для Казахстана тексты должны быть сверены с действующей редакцией Закона РК «О персональных данных и их защите», включая требования к согласию, минимизации и трансграничной передаче; отдельно нужны проверка Закона «О защите прав потребителей» и ГК РК по оферте/договору и возвратам:

- [Закон РК «О персональных данных и их защите»](https://old.adilet.zan.kz/rus/docs/Z1300000094)
- [Закон РК «О защите прав потребителей»](https://old.adilet.zan.kz/rus/docs/Z100000274_)
- [Гражданский кодекс РК, общая часть](https://old.adilet.zan.kz/rus/docs/K940001000_)

Эти ссылки и инженерный шаблон политики не являются юридическим заключением. Реальные cookies, аналитика и сторонние processors должны быть перечислены в утверждённой privacy/cookie policy до публикации.
