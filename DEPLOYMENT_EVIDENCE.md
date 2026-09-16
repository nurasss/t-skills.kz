# ORBITA-30 deployment evidence

## Current v2 deployment gate

```text
Branch: feature/orbita-v2-core60-mercury
Assessment: orbita30_ru_v2
Core: 60 fixed items
Adaptive: Mercury 2.5 on staging only; approved fallback on failure
Production Mercury: OFF
V2_STAGING_READY=NO
Blocker: INCEPTION_API_KEY must be provisioned as a managed staging secret, then the v2 branch must be deployed and its authenticated full E2E/smoke/failure simulation recorded.
Source commit: e5c77ef383e8487012f927c1cfa81acb8de0b062
Source package SHA-256: 2e88dce6224b21bfd049e4e18605c0e85de6aeb19800f4cc672dcc6b98042ffb
```

The blocker is external and intentional: no API key is stored in the repository or printed in evidence. The exact operator action is `npx wrangler secret put INCEPTION_API_KEY --env staging --config wrangler.jsonc`, followed by staging deployment and the v2 smoke gates. Production must not be switched to Mercury before those gates pass.

The deployment block below is retained as historical pre-v2 Cloudflare evidence; its `AI_ENABLED=false` state is not evidence that the v2 Mercury staging gate has passed.

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
- Remote D1 migrations are complete in both environments; `npx wrangler d1 migrations list ... --env staging` and `... --env production` report no migrations to apply through `0010_clever_unicorn.sql`.
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
- The final local QA run passed all 34 unit/property/fault tests and the release verification reproduced the exact source archive hash twice.
```

No secret values belong in this file.
