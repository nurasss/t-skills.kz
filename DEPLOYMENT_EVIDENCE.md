# ORBITA-30 deployment evidence

> Product subsequently renamed to T-Skills. This file is preserved as historical evidence of the release that shipped under the ORBITA-30 name; worker, D1/R2 and URL identifiers below are intentionally unchanged.

> Historical-evidence warning: deployment entries dated through 2026-09-26 describe older source snapshots. The current dirty worktree was manually deployed to the VPS on 2026-10-04; see the final entry. That deployment does not establish hosted CI or Cloudflare Worker staging/production evidence.

## Read-only production observation (2026-10-04)

- `GET https://t-skills.kz/api/health` returned 200 with `environment=production`, payments off, AI off and `entitlementMode=beta-free`.
- `GET https://t-skills.kz/api/catalog` returned 200 with the active `t-skills-teen-v1`; checkout price is unset and unavailable.
- The catalog's legal payload returned fallback-like operator facts while `reviewStatus` was empty. `GET /robots.txt` allowed public indexing. This matched the old source default and contradicted the open legal approval record.
- The Cloudflare staging and production Worker health URLs returned Cloudflare Access redirects (302), so they were not inspected past the access boundary.
- These were read-only GET requests before the later 2026-10-04 deployment; they did not modify production data. Response headers did not identify a source SHA. The subsequent deployment image and artifact identities are recorded in the final entry below.
- The source fixes redact unapproved legal values and policy blocks, add a review warning, and block production intake/checkout/indexing until legal values and the approval marker are present. They were deployed to the VPS in the 2026-10-04 entry below.

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

## VPS production deploy 2026-09-26 (approved 75 + 8 pathway, t-skills-teen-v1)

- Source: commit bdd2bdf (PR nurasss/orbita-30#1, CI green), synced local -> /opt/t-skills via rsync (same excludes; deploy/vps/.env kept; no deletions).
- Pre-deploy DB backup: /data/backups/app-pre-teen-20260926.db (in volume) and ~/t-skills-backups/app-pre-teen-20260926.db (host).
- Previous image preserved as t-skills:vps-prev (c07d8684ee9e); new image built with the shared-proxy compose file; container recreated.
- Migrations applied on boot: 0022_wonderful_sinister_six, 0023_teen_assessment_version. assessment_versions: t-skills-teen-v1 PUBLISHED, t-skills_pairwise_v1 RETIRED; 7 existing COMPLETE reports untouched.
- Checks: https://t-skills.kz/api/health 200; /api/catalog assessmentVersion=t-skills-teen-v1; landing shows «75 сравнений и 8 ситуативных»; no errors in app logs.
- Pre-deploy verification: local Worker/D1 and local VPS build/SQLite end-to-end (onboarding, 75 -> 8, report, PDF).
- Rollback: docker tag t-skills:vps-prev t-skills:vps && compose up -d app; data: restore app-pre-teen-20260926.db into /data/app.db with the app stopped.

## VPS production deploy 2026-09-26 (PDF career directions page)

- Source: commit 577aae3 (PR nurasss/orbita-30#1, CI green), rsync as above (2 files changed).
- Rollback images: t-skills:vps-prev (45ce6f0f6f18, first teen deploy) and t-skills:vps-pre-teen (c07d8684ee9e, before t-skills-teen-v1); new image 9ca60b03ce78. Removed 4 unused, untagged old t-skills images (30714d7bcae1, f5d934779c96, c19b12c85dcd, 6e78cb019cdf) to keep the shared host above 2 GB free.
- Migrations: none pending (applied=0).
- Production UI test by owner account: onboarding validation (UI + server 422), 75 pairs identical to the client list, 8 situational questions from the pool (RU/KK, no trait id shown), results with values/subjects; test report PDF regenerated: 25 pages incl. «Карьерные направления», methodology «8 ситуативных уточнений».

## VPS production deploy 2026-09-26 (checkout promo code input & secure validation)

- Source: promo input placed under CTA button on /checkout/t-skills with inline apply button, uppercase formatting, rate limiting (10 req/5 min), CSRF protection, and atomic SQLite/D1 redemption.
- Pre-deploy DB backup: ~/t-skills-backups/app-pre-promo-20260926_123416.db.
- Rollback: docker tag t-skills:vps-prev t-skills:vps && docker compose -f docker-compose.yml -f docker-compose.shared-proxy.yml up -d app.

## VPS production deploy 2026-10-04 (fail-closed legal and intake gate)

- Target: `kz-vps`, app `tskills-app`, public host `https://t-skills.kz`, shared Caddy proxy. Source was synced over SSH/rsync from branch `feature/orbita-v2-core60-mercury`, based on Git HEAD `8713135038136a7a2608f8ca2102f026a25dc1e2`. The worktree had 157 modified/new paths and was not represented by that commit; no clean source commit or hosted CI run is claimed.
- `npm run build:vps` passed under Node `22.13.0`. Runtime artifact SHA-256: `82a0773ebb5115484e04c3558530d6cd0feaa0b6cba43a83caa7ba6944db4ab9`. Linux Sharp packages matched the lockfile SHA-512 and passed a Linux-container PNG smoke.
- New image: `t-skills:vps`, image ID `9229867a173e6e2ad405702f9bbd27d4d20ed246e3d24804a54793a975934ddb`. Previous live image retained as `t-skills:pre-20261004-01` (image ID `1edb62949307b1afc3b9a9310f6a80807bfbd4b35f69b7cc1712c867215f83d6`). The previous `t-skills:rollback-seo-20261003` tag was left intact.
- Pre-deploy SQLite/files backup, created with the app stopped and stored root-only: `/opt/t-skills-backups/tskills-data-20261004-before-deploy.tgz`, mode `0600`, size 1,107,368 bytes, SHA-256 `c6e2ae503dddbbd0e900d860855a6431598c3b273ddba8dc151e72fc94c2c3c4`.
- `deploy/vps/.env` was preserved and its permissions tightened to `0600`; no secret values were copied into the workspace or logged. Source rsync excluded environment files, Git data, dependencies, build outputs and application data, and did not delete remote files.
- Migrations on the production database: `MIGRATE_SQLITE_DONE applied=0`; the deployed schema was already current.
- Post-deploy checks: homepage, health, catalog, privacy and terms returned `200`; unauthenticated admin overview returned `401`; HSTS, CSP, nosniff and frame denial headers were present. Catalog reports `t-skills-teen-v1`, checkout unavailable, and legal documents unapproved. Health reports `legalDocumentsApproved=false`, `productionDataIntakeEnabled=false`, payments off and AI off. `robots.txt` returns `Disallow: /`; sitemap is empty.
- This is a safety deployment, not legal approval or launch authorization. New assessments/registration/checkout and indexing remain disabled until real operator/legal values and the signed approval are configured. Public paid launch, Cloudflare Worker environments, hosted CI, MFA and external security review remain open.
- Rollback image: `docker tag t-skills:pre-20261004-01 t-skills:vps` then `docker compose --project-name vps -f /opt/t-skills/deploy/vps/docker-compose.yml -f /opt/t-skills/deploy/vps/docker-compose.shared-proxy.yml up -d --no-build --force-recreate app`. Database backup is available at the path above; restore only with the app stopped.

## VPS production update 2026-10-04 (Teen v2 scoring correction)

- Target: `kz-vps` / `https://t-skills.kz` / `tskills-app`. Source synced over SSH from dirty worktree on branch `feature/orbita-v2-core60-mercury`, based on HEAD `8713135038136a7a2608f8ca2102f026a25dc1e2`; 165 modified/new paths were present and are not represented by that commit.
- `npm run build:vps` passed under Node `22.13.0`. Runtime artifact SHA-256: `ec48ded86c95ecb0721c26d685b0c13a23fba429a1f0bc58cbfebcd1be474957`. Linux Sharp binaries matched the package-lock SHA-512 and passed a Linux-container PNG smoke.
- Current image: `t-skills:vps`, ID `a2f14aafdb22fd5cac1e8961a3d7738a68e327b752f420fcba10ae88379bea6f`. Previous legal-gated image is retained under `t-skills:pre-teen-v2-scorer-20261004`, ID `9229867a173e6e2ad405702f9bbd27d4d20ed246e3d24804a54793a975934ddb`.
- Migration `0024_teen_scoring_direction_v2` is recorded in `_migrations`. `assessment_versions` shows `t-skills-teen-v2=PUBLISHED`, `t-skills-teen-v1=RETIRED`, `t-skills-teen-v1-fix=RETIRED`. One unfinished v1 session moved to the internal fix bridge; it retains its original layout and saved answers. Completed v1 scores were not rewritten.
- Recovery snapshot captured while the app was stopped after migration: `/opt/t-skills-backups/tskills-data-post-teen-v2-20261004.tgz`, mode `0600`, 1,107,570 bytes, SHA-256 `37ba6e82a18b22f144a6d87c40cd80e0624ec400fbe44287df9ef544274c1483`. A v1-compatible rollback snapshot was derived from it by reversing only migration 0024's assessment-version metadata: `/opt/t-skills-backups/tskills-data-pre-teen-v2-rollback-20261004.tgz`, mode `0600`, 1,107,560 bytes, SHA-256 `caf243787e49e3b1837e12fd64f50c22435d47953ef9e159ee4d1de951dee808`. The pre-v2 snapshot preserves responses/files; the migrated attempt's `updated_at` remains at the migration timestamp.
- `.env` content was preserved and remains mode `0600`. Rsync excluded secrets, `.git`, dependencies, build outputs and app data and did not delete remote files.
- Post-deploy checks: homepage, health, catalog, privacy and terms `200`; unauthenticated admin `401`; security headers present. Catalog reports `t-skills-teen-v2`, checkout unavailable and legal review as draft. Health reports `legalDocumentsApproved=false`, `productionDataIntakeEnabled=false`, payments off and AI off. `robots.txt` is `Disallow: /`; sitemap is empty. The migration row is present and the current process restart reports `MIGRATE_SQLITE_DONE applied=0`.
- No production assessments or payment transactions were created during validation. V1 completed reports are not recomputed; the result page and newly generated PDFs warn about the scoring error. Already stored PDF blobs are not rewritten. Review findings and unresolved item wording/validation risks are in `TEEN_ASSESSMENT_REVIEW.md`.
- Rollback is **not image-only** because migration 0024 retires v1 and maps one unfinished attempt to `t-skills-teen-v1-fix`. Stop the app, restore the v1-compatible snapshot above to `vps_tskills-data`, tag `t-skills:pre-teen-v2-scorer-20261004` as `t-skills:vps`, and recreate only `app`. Verify the snapshot/hash before any restore. The deployed legal gate remains closed regardless of this assessment update.

## VPS production deploy 2026-10-04 (Teen scoring fix, `t-skills-teen-v2`)

- Target: `kz-vps` / `https://t-skills.kz` / `tskills-app`, same shared Caddy proxy. Source synced over SSH from dirty worktree on branch `feature/orbita-v2-core60-mercury`, based on Git HEAD `8713135038136a7a2608f8ca2102f026a25dc1e2`; the snapshot contained 165 modified/new paths and is not represented by that commit.
- Build: `npm run build:vps` passed with Node `22.13.0`. Linux Sharp packages matched package-lock SHA-512 and passed a Linux PNG smoke. Runtime artifact SHA-256: `ec48ded86c95ecb0721c26d685b0c13a23fba429a1f0bc58cbfebcd1be474957`.
- New current image: `t-skills:vps`, image ID `a2f14aafdb22fd5cac1e8961a3d7738a68e327b752f420fcba10ae88379bea6f`. Previous legal-gated image retained as `t-skills:pre-teen-v2-scorer-20261004`, image ID `9229867a173e6e2ad405702f9bbd27d4d20ed246e3d24804a54793a975934ddb`.
- Migration `0024_teen_scoring_direction_v2` is recorded in the production `_migrations` table. `assessment_versions` now has `t-skills-teen-v2=PUBLISHED`, `t-skills-teen-v1=RETIRED`, and `t-skills-teen-v1-fix=RETIRED`. One unfinished v1 attempt was moved to the v1-fix bridge; its saved answers and original item layout were retained. Completed v1 scores were not rewritten.
- Restricted recovery snapshot created with the app stopped after migration 0024: `/opt/t-skills-backups/tskills-data-post-teen-v2-20261004.tgz`, mode `0600`, 1,107,570 bytes, SHA-256 `37ba6e82a18b22f144a6d87c40cd80e0624ec400fbe44287df9ef544274c1483`. The earlier `tskills-data-20261004-before-deploy.tgz` is a pre-safety-deploy snapshot from 04:36 UTC, not an exact v2 rollback snapshot.
- `.env` contents were preserved; permissions remain `0600`. Rsync excluded env files, `.git`, dependencies, build outputs and application data; it did not delete remote files.
- Checks against the public host: homepage/health/catalog/privacy/terms 200; unauthenticated admin overview 401; CSP/HSTS/nosniff/frame-denial headers present. Catalog reports `assessmentVersion=t-skills-teen-v2`, `availableForCheckout=false`, legal review as draft. Health reports `legalDocumentsApproved=false`, `productionDataIntakeEnabled=false`, payments off and AI off. `robots.txt` disallows indexing and sitemap is empty. Production migration log on restart reports `applied=0` after the initial v2 startup; the migration table confirms 0024 is present.
- This deployment fixes new v2 scoring and balances left/right display exposure (3/3 per trait). It does not validate the questionnaire. Existing completed v1 results remain stored and are warned in the result view and regenerated PDFs; already stored PDF objects are not rewritten. No production assessment was created during verification.
- The previous image is retained, but an image-only rollback is not compatible with migration 0024's v1-fix session metadata. Any rollback must restore a compatible database snapshot with the app stopped; inspect the snapshot date and data delta before restoring. Forward-fix is preferred.
