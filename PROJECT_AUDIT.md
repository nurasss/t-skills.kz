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

Последние локальные результаты:

- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm test` — 51/51 PASS
- `npm run test:coverage` — PASS, branch coverage `83.29%` (critical security/provider/auth modules remain above their configured gates)
- `npm run build` — PASS
- `npm run test:browser` — 1/1 PASS
- `npm run security:scan` — PASS, секретов не найдено в tracked/untracked source и reachable Git history
- `npm run audit:check` — 0 vulnerabilities across runtime and development dependencies
- `npm run csp:check`, `npm run prompts:check`, `npm run bundle:check`, `npm run unused-deps` — PASS
- `npm run contrast:check` — PASS, 13 critical text/button pairs, minimum ratio `5.63`
- `npm run test:e2e`, `npm run test:beta`, `npm run test:load`, `npm run test:backup`, `npm run test:retention-plan` — PASS в изолированном локальном Worker/D1/R2-контуре; load smoke зафиксировал `error_rate=0`, `lost=0`, `duplicated=0`
- mobile 390 px — без horizontal overflow; focus trap/escape для drawer проверены

## Остаточные риски и обязательные действия до запуска

1. Заполнить реальные `LEGAL_*`, `SUPPORT_CONTACT`, `SECURITY_CONTACT_EMAIL`, `EMAIL_FROM` и другие operator values. Сейчас `npm run deploy:config-check` намеренно останавливается на `DEPLOY_CONFIG_EMAIL_FROM_MISSING:staging`.
2. Проверить Privacy/Terms/Cookies/Refunds юристом и утвердить оператора, адрес, юрисдикцию, цели, категории, сроки, processors, трансграничную обработку, порядок отзыва и коммерческие условия.
3. Настроить Resend verified sender, отдельные staging/prod secrets, WAF/CDN, alerting, backup RPO/RTO и incident/on-call контакты. Не переносить значения из `.env.example` в production.
4. Добавить MFA для администраторов и провести внешний penetration test с повторной проверкой исправлений.
5. Применить миграции `0013`–`0015` к правильным изолированным D1 environments и выполнить authenticated hosted smoke после текущего worktree.
6. Не включать Stripe/payment и Mercury/OpenAI в production beta до утверждения цены, webhook, processor disclosure и операционного процесса возвратов.
7. Не публиковать normative percentile, clinical, IQ, hiring или иные high-stakes claims до независимой psychometric validation, fairness/DIF, reliability, validity и norms work.

## Юридическая рамка

Для Казахстана тексты должны быть сверены с действующей редакцией Закона РК «О персональных данных и их защите», включая требования к согласию, минимизации и трансграничной передаче; отдельно нужны проверка Закона «О защите прав потребителей» и ГК РК по оферте/договору и возвратам:

- [Закон РК «О персональных данных и их защите»](https://old.adilet.zan.kz/rus/docs/Z1300000094)
- [Закон РК «О защите прав потребителей»](https://old.adilet.zan.kz/rus/docs/Z100000274_)
- [Гражданский кодекс РК, общая часть](https://old.adilet.zan.kz/rus/docs/K940001000_)

Эти ссылки и инженерный шаблон политики не являются юридическим заключением. Реальные cookies, аналитика и сторонние processors должны быть перечислены в утверждённой privacy/cookie policy до публикации.
