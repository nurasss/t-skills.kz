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
