# ORBITA-30 deployment evidence

> Product subsequently renamed to T-Skills. This file is preserved as historical evidence of the release that shipped under the ORBITA-30 name; worker, D1/R2 and URL identifiers below are intentionally unchanged.

> Historical-evidence warning (2026-09-17): the deployment records below were produced before the current worktree switched from the dispatch/Cloudflare Access identity boundary to first-party application authentication and added legal/cookie/auth hardening. They are not evidence that the current uncommitted source is deployed. Re-run migrations, deploy both environments and regenerate this file after operator values and secrets are configured.

## Historical v2 deployment gate

```text
Branch: feature/orbita-v2-core60-mercury
Assessment: orbita30_ru_v2
Core: 60 fixed items
Adaptive: Mercury 2.5 on staging only; approved fallback on failure
Production Mercury: OFF
V2_STAGING_READY=YES
Managed staging secret: PASS (INCEPTION_API_KEY exists; value is not recorded)
Remote v2 migrations: PASS (0011_hard_lifeguard.sql, 0012_adaptive_generation_attempts.sql)
V2 staging deploy: PASS (Worker version 7c31c70a-33c4-4d82-807a-b811e3f31b95)
Authenticated v2 smoke: PASS (health, catalog, Core60, Mercury, report and signed PDF)
Source commit: d3ea99fd1cac90b7d76d3fcf5e790a73eaa35f13
Source package SHA-256: 0e7975c9f9085762e0a56550de35c165bb58956421034ab740ad1b48e3bd0efb
```

The key is managed outside Git and is not printed in evidence. Staging v2 acceptance completed on 2026-09-16: anonymous access returned 302 at the Access boundary; authenticated health returned 200 with `paymentsEnabled=false`, `aiEnabled=true`, `adaptiveProvider=mercury`, `entitlementMode=beta-free`, and `normStatus=unvalidated`; the live assessment completed all 60 Core responses, Mercury returned 12 adaptive questions on its first attempt, the report completed with `adaptiveFallbackUsed=false`, and the signed PDF download returned HTTP 200 (`49,362` bytes). Local malformed/timeout/fallback tests remain PASS. Production Mercury remains OFF.

## Historical secondary Vercel preview

```text
Project: nurasss-projects/orbita-30 (private)
Deployment: https://orbita-30-9t2gqegij-nurasss-projects.vercel.app
Inspect: https://vercel.com/nurasss-projects/orbita-30/uufooNnVjaWfhMZ1xarpVm7zHiV3
Target: Preview
Status: READY
Source commit: 6dd080a48e07a8712f76bc0f8169b7383dd7c611
Build: Nitro/Vinext Vercel Build Output API
Smoke: PASS (home 200; /api/health 200; /api/catalog?locale=ru 200)
Storage/auth boundary: D1/R2 and Cloudflare Access are intentionally not emulated on Vercel
```

This Vercel deployment is a private visual/runtime preview only. The complete assessment, account, report, PDF and retention flows remain on the Cloudflare Worker because the application requires Cloudflare D1/R2 bindings. A protected Vercel Preview request to a storage-backed account route correctly returns `DATABASE_UNAVAILABLE`; no Vercel production promotion was performed.

The source commit shown above predates the evidence-only deployment commit. The exact current code and evidence identity are recorded in `RELEASE_MANIFEST.json` after the evidence commit; no secret value belongs in this file.

The deployment block below is retained as historical pre-v2 Cloudflare evidence; its Access boundary and `AI_ENABLED=false` state are not evidence for the current source.

```text
GitHub URL: https://github.com/nurasss/orbita-30
Visibility: PRIVATE
Source SHA: 6523f627cef5a9014d9ef6d2edd8e0b4c5c0159a
CI Run URL: PENDING
CI Run ID: PENDING

STAGING:
Worker: orbita-30-staging
URL: https://orbita-30-staging.bulatulynurasyl22.workers.dev
D1: orbita30-staging
R2: orbita30-staging (CREATED, private)
Access: PASS (owner-only email policy; Service Auth policy for staging and production smoke tokens)
Deploy Run: local Wrangler 2026-09-16 / version 776cf026-da76-4945-b29f-9b73bb67d9f6
Smoke: PASS (2026-09-16T11:26:22Z; anonymous blocked; authenticated health 200; payments=OFF; ai=OFF)
Backup/Restore: PENDING

PRODUCTION:
Worker: orbita-30-production
URL: https://orbita-30-production.bulatulynurasyl22.workers.dev
D1: orbita30-production
R2: orbita30-production (CREATED, private)
Access: PASS (owner-only email policy; Service Auth policy for staging and production smoke tokens)
Deploy Run: local Wrangler 2026-09-16 / version bcafda39-828b-4f74-a969-bf30f1e1e3b7
Smoke: PASS (2026-09-16T11:26:26Z; anonymous blocked; authenticated health 200; payments=OFF; ai=OFF)

PAYMENTS_ENABLED=false
AI_ENABLED=false
ADAPTIVE_PROVIDER=deterministic
REPORT_PROVIDER=approved-library
normStatus=unvalidated

Provisioning and deployment checks completed 2026-09-16:

- Root-config deploy dry-run passed with `--config wrangler.jsonc --env staging`; the binding preview resolved `orbita30-staging` for D1 and R2.
- Historical pre-v2 remote D1 migrations were complete in both environments through `0010_clever_unicorn.sql`; current staging v2 deployment additionally applied `0011_hard_lifeguard.sql` and `0012_adaptive_generation_attempts.sql`.
- Cloudflare R2 account activation completed in the Dashboard; private buckets `orbita30-staging` and `orbita30-production` were created and verified with Wrangler.
- Staging and production Workers are published on the account `workers.dev` subdomain and both anonymous probes return the expected `401 Access required` response from the configured `AUTH_PROVIDER=cloudflare-access` boundary.
- Cloudflare Access application `ORBITA-30 Closed Beta` protects both Worker destinations with an owner-only email Allow policy and a Service Auth policy covering the two smoke tokens; no additional beta tester emails are configured.
- Worker Access integration is compatible with the Static Assets router: `assets.binding=ASSETS`, static assets use asset-first routing (`assets.run_worker_first=false`), and dynamic requests verify the Access JWT fallback with the configured team issuer and audience when `ctx.access` is unavailable.
- Hosted smoke checks passed in both environments using the Access service tokens; the health contract confirms `paymentsEnabled=false`, `aiEnabled=false`, `entitlementMode=beta-free`, and `normStatus=unvalidated`.
- `PDF_SIGNING_SECRET` was generated independently and uploaded as a managed secret to both Worker environments; no secret value is recorded here.
- GitHub environments `staging` and `production` exist. Repository secret `CLOUDFLARE_ACCOUNT_ID` is configured without recording its value here.

GITHUB_PRIVATE_REPO_READY=YES (private repo with full history; main + develop pushed)
EXTERNAL_CI_READY=NO
CLOUDFLARE_STAGING_READY=YES
CLOUDFLARE_PRODUCTION_BETA_READY=YES
ACCESS_ALLOWLIST_READY=YES
BETA_FREE_FLOW_READY=YES (local automated evidence only)
AI_OFF_FLOW_READY=YES (local automated evidence only)
BETA_SMOKE_READY=YES
FINAL_LOCAL_QA=PASS (40/40 tests; coverage; lint; TypeScript; build; security scan; deployment config; load; beta; browser CSP; PDF visual; backup/restore)

External blockers recorded 2026-09-16:

- GitHub Actions runs start with `startup_failure` and zero jobs on the current private Free-plan account. GitHub branch protection and repository rulesets return `Upgrade to GitHub Pro or make this repository public`.
- Cloudflare Zero Trust Free is initialized and visible in Cloudflare One. The requested allowlist is owner-only, so no beta tester email list was added.
- The final local QA run passed all 40 unit/property/fault/routing/queue tests and the release verification reproduced the exact source archive hash twice.
```

No secret values belong in this file.

## VPS production deploy 2026-09-18 (paper design system + brand)

- Source synced local -> /opt/t-skills via rsync (node_modules, build outputs, .git, deploy/vps/.env excluded; no deletions).
- Previous image preserved as t-skills:vps-prev (03612487939e) for rollback.
- Rebuilt with docker compose (docker-compose.yml + docker-compose.shared-proxy.yml, service app); migrations 0016-0018 applied on boot; container healthy.
- Verified: GET / 200 with new landing (paper hero, BrandIcon lockup, 15 000 ₸ pricing), GET /api/catalog 200 (beta-free, KZT, t-skills_pairwise_v1).
- Shipped uncommitted working tree from branch feature/orbita-v2-core60-mercury (local HEAD 5a80a5d plus session changes); no secrets transferred (deploy/vps/.env kept server-side).
- Rollback: docker tag t-skills:vps-prev t-skills:vps && compose up -d app.

## VPS production deploy 2026-09-18 (evening: hero split, brand lockup, animations, pairwise mobile, 15 000 ₸)

- Source synced local -> /opt/t-skills via rsync (same excludes; deploy/vps/.env kept; no deletions).
- Previous image preserved as t-skills:vps-prev (83c31ab557f1); new image 3a016c0908d5; container recreated healthy, migrations applied=0 (all current).
- Verified: GET / 200 (two-column hero, footer lockup with tagline, 15 000 ₸ pricing), GET /api/catalog 200 (beta-free, KZT, t-skills_pairwise_v1).
- Rollback: docker tag t-skills:vps-prev t-skills:vps && compose up -d app.

## VPS production deploy 2026-09-18 (night: trait icons + pairwise restyle)

- Source synced local -> /opt/t-skills via rsync (same excludes; deploy/vps/.env kept; no deletions).
- Previous image preserved as t-skills:vps-prev (3a016c0908d5); new image bbe7b02b5ba2; container recreated healthy.
- Verified: GET / 200, served CSS contains ov-pairwise-card/medallion, bronze CTA, question animation; /api/catalog 200.
- Rollback: docker tag t-skills:vps-prev t-skills:vps && compose up -d app.

## VPS production deploy 2026-09-19 (email truncation + hydration-safe dates)

- Source synced local -> /opt/t-skills via rsync (same excludes; deploy/vps/.env kept; no deletions).
- Previous image preserved as t-skills:vps-prev (bbe7b02b5ba2); new image 8c38cb1deb9b; container recreated healthy.
- Fixes: long displayName middle-truncation (bul..22@gmail.com) with full value in title; ClientDate component removes toLocale* SSR/CSR hydration mismatches (verified in UTC+14).
- Verified: GET / 200 (new build markers), GET /api/catalog 200.
- Rollback: docker tag t-skills:vps-prev t-skills:vps && compose up -d app.

## VPS SMTP cutover 2026-09-19 (свой Postfix вместо Resend)

- Причина: Resend-ключ send-only, домен не верифицирован (ошибка 1010, письма только владельцу аккаунта).
- Postfix был остановлен (stale pid) — поднят; слушает 127.0.0.1:25 и 172.18.0.1:25 (контейнер app в той же docker-сети, relay без смены конфига соседей).
- OpenDKIM: добавлен ключ tskills для t-skills.kz (KeyTable/SigningTable, timetrack.kz не тронут).
- Код: lib/email.ts — EMAIL_PROVIDER=resend|smtp (nodemailer 7), сервер переключён на smtp (SMTP_HOST=172.18.0.1).
- E2E: инвайт + регистрация nuras@qsqrp.com через публичный API -> delivered=true, postfix 250 OK дважды.
- Открыто: DNS у регистратора (SPF/DKIM/DMARC), PTR у хостера, иначе Gmail может класть в спам.
- Rollback почты: EMAIL_PROVIDER=resend в deploy/vps/.env + рестарт app (Resend-ключ на месте).

## VPS production deploy 2026-09-19 (logout button)

- Source synced local -> /opt/t-skills via rsync (same excludes; deploy/vps/.env kept; no deletions).
- Previous image preserved as t-skills:vps-prev (4b8788b02450); new image 49d1d0eeee33; container recreated healthy.
- Change: account view gains "Выйти" (POST /api/auth/logout -> top-level navigate home).
- Verified: GET /api/catalog 200.
- Rollback: docker tag t-skills:vps-prev t-skills:vps && compose up -d app.

## VPS production deploy 2026-09-19 (auth UX: password toggle, live mismatch, mobile keyboards)

- Source synced local -> /opt/t-skills via rsync (same excludes; deploy/vps/.env kept; no deletions).
- Previous image preserved as t-skills:vps-prev (49d1d0eeee33); new image c2551f009c01; container recreated healthy.
- Change: registration/login password visibility toggle, live password-mismatch warning + disabled submit, email/invite inputs hardened for mobile keyboards, resend link only after attempt, larger consent tap targets.
- Verified: GET /auth?mode=register 200 contains toggle; GET /api/catalog 200.
- Rollback: docker tag t-skills:vps-prev t-skills:vps && compose up -d app.

## VPS production deploy 2026-09-19 (open registration, no invite code)

- Server: REGISTRATION_MODE=invite -> public (backup at /tmp/t-skills-env.bak on host).
- Code: invite field optional in auth form ("Код приглашения (если есть)").
- Previous image preserved as t-skills:vps-prev (c2551f009c01); new image c79c07531ae0; container recreated healthy.
- Verified: POST /api/auth/register WITHOUT invite -> 202 ok/delivered; test user removed afterwards (tokens, credentials, row).
- Rollback: invite mode = set REGISTRATION_MODE=invite + restart; image = tag vps-prev + up -d app.

## Prod E2E audit 2026-09-19 (ALL GREEN) + test data cleanup

- Local unit suite: 91/91 pass (fixed 1 pre-existing branding failure by renaming ORBITA_UNLIMITED_ASSESSMENT_EMAILS -> TSKILLS_UNLIMITED_ASSESSMENT_EMAILS in code + examples; server .env follows on next deploy).
- Prod API E2E (temporary script, removed after): register -> login -> assessment -> onboarding -> consents -> 67 core answers -> complete-core (8 adaptive) -> adaptive answers -> complete -> report COMPLETE (25 traits) -> signed PDF download (valid %PDF) -> export -> logout -> 401 boundary -> re-login -> account delete -> user row gone. Email verify step emulated in DB (real link-click proven separately by owner account).
- Orphan e2e users from failed runs fully removed (cascade incl. telemetry_events, privacy_requests).

## VPS production deploy 2026-09-19 (env rename + full E2E re-run)

- Renamed ORBITA_UNLIMITED_ASSESSMENT_EMAILS -> TSKILLS_UNLIMITED_ASSESSMENT_EMAILS (code, examples, server .env); fixes the 1 failing branding unit test. Local suite now 91/91.
- New image 28cc3248516b; container healthy.
- Full prod E2E re-run on new build: ALL GREEN (register/login/67+adaptive/report/PDF/export/logout/delete).
- No e2e debris left in prod DB. Temp scripts removed.
- Rollback: image vps-prev (c79c07531ae0).

## VPS production deploy 2026-09-19 (answer revision, no-break flow, career clarity)

- Changes: answer change-of-mind before Continue (server UPDATE-with-phase-guards + client replacePending + per-question send serialization); break view removed (uninterrupted 67->adaptive flow; /break and /adaptive URLs resolve to assessment); career options get unmistakable selected state (accent border + check badge).
- Previous image vps-prev (28cc3248516b); new image 8242f665a1d3; healthy.
- Verified: unit 91/91; prod E2E ALL GREEN incl. revision proof (2 -> -1 stored), report, PDF, delete.
- Rollback: tag vps-prev + up -d app.

## VPS production deploy 2026-09-20 (progress 134/179 fix, names in contour, processing timeline)

- Fixed adaptive-phase counter: router passed core questionIndex (67+67=134, 179%); now shows Q68-75 and correct percent.
- Results "Контур профиля" shows Russian trait names instead of English codes.
- Processing timeline hides ADAPTIVE_PROVIDER_FAILED unless it is the current status.
- Verified: tsc/eslint clean, unit 91/91.
- Rollback: image vps-prev (8242f665a1d3).

## VPS production deploy 2026-09-20 (audit batch: fonts leak, report/admin/methodology truth, links, menus, security.txt)

- Removed legacy Inter/Instrument Serif next/font imports: prod Link headers no longer leak /Users/nuras/... paths and no longer 404 (verified live).
- Report: "Полный профиль {N}", plan subtitle follows actual count, empty domains section hidden, contour shows Russian names.
- Processing: core counter from live bank size; provider-failed row only when active.
- Admin panel reflects live pairwise bank (67 + adaptive + legacy); methodology model/scoring/adaptive/version blocks use live taxonomy and version IDs.
- SectionHeading supports h1 (catalog, methodology); shell nav/footer are real links with SPA fast path; Escape closes menus; landing burger gains backdrop close; security.txt route added (404 until SECURITY_CONTACT_EMAIL set).
- Incident during deploy: disk 100% (40G) crashed boot (SQLite WAL I/O error); freed 6.8G via docker builder/image prune; site restored on new image. Watch disk: containerd 13G belongs to neighbors, untouched. Recommend log/size monitoring.
- Rollback: image vps-prev.

## VPS production deploy 2026-09-20 (backdrop, favicon.ico, security.txt live)

- Shell mobile menu: tap-outside backdrop close (+ existing Escape).
- Real public/favicon.ico generated from brand SVG; wired into metadata.
- SECURITY_CONTACT_EMAIL=support@t-skills.kz on server; /.well-known/security.txt now 200.
- Verified: security 200, favicon 200, catalog 200.
- Rollback: image vps-prev (50c7e88f5268).

## VPS production deploy 2026-09-20 (Gallup-style results web + PDF engine)

- Web results: profile strip, ranked Укрепляйте/Изучайте lists, trait detail blocks with domain chips and quote cards.
- PDF engine rewritten in same spirit (paper palette, Newsreader headlines, ranked pages, detail pages with quotes, dynamic profile chunks, live methodology numbers); 24-page contract preserved and verified on all 4 fixtures (A4 ok).
- Verified: unit 91/91, tsc/eslint clean.
- Rollback: image vps-prev (350d6594ca8c).

## VPS production deploy 2026-09-20 (audit fixes: PDF Cyrillic, 5 detail cards, names, numbering)

- PDF serif Newsreader->Lora (Newsreader has no Cyrillic; PT Serif subset breaks in pdf-lib). Verified by rendering: Russian headings print correctly. 24 pages intact.
- Web results: 5 detail cards (was 3), Russian trait names via profile lookup (was English codes), sequential section numbers with hidden domains section.
- Verified: unit 91/91, tsc/eslint clean.
- Rollback: image vps-prev (23557ad975d7).

## VPS production deploy 2026-09-20 (Empirical Vanguard landing)

- Full landing rewrite: white canvas, Inter Tight (Hanken Grotesk from the mock has no Cyrillic — substituted closest grotesque with Cyrillic), botanical green accents.
- Copy adapted to product truth (no clusters/norms/forever/ISSN/professions claims); EN toggle hidden pending reviewed translation.
- Verified: tsc/eslint clean, desktop+mobile screenshots, no overflow.
- Rollback: image vps-prev (fc6ca778ba18).

## VPS production deploy 2026-09-20 (Empirical Vanguard site-wide)

- Rethemed all views/shell/auth/cookie/legal to white canvas + green + Inter Tight (Hanken has no Cyrillic).
- Verified: tsc/eslint clean, unit 91/91, contrast PASS, screenshots desktop+auth.
- Rollback: image vps-prev (cb969d94f3ed).

## VPS production deploy 2026-09-21 (landing cleanup: no badges/microstats, tighter hero)

- Rollback: image vps-prev (43907d6f31e3).

## VPS production deploy 2026-09-21 (qmock full width, quiet CTA)

- Rollback: image vps-prev (7ff753566e6f).

## VPS production deploy 2026-09-21 (email full/short responsive)

- Rollback: image vps-prev (ee7a50b639bb).

## VPS production deploy 2026-09-21 (account buttons alignment)

- Rollback: image vps-prev (92bd22e8b957).
