# ORBITA-30 deployment evidence

```text
GitHub URL: https://github.com/nurasss/orbita-30
Visibility: PRIVATE
Source SHA: 1211f83a58de72962d5695a5a9dd902215b28c96
CI Run URL: PENDING
CI Run ID: PENDING

STAGING:
Worker: orbita-30-staging
URL: https://orbita-30-staging.bulatulynurasyl22.workers.dev
D1: orbita30-staging
R2: orbita30-staging (CREATED, private)
Access: PENDING
Deploy Run: 1faf9939-495b-430d-b7ba-8d11ab941f9c / version c05a320d-893f-464e-b01e-8a2d0af09974
Smoke: PENDING
Backup/Restore: PENDING

PRODUCTION:
Worker: orbita-30-production
URL: https://orbita-30-production.bulatulynurasyl22.workers.dev
D1: orbita30-production
R2: orbita30-production (CREATED, private)
Access: PENDING
Deploy Run: 7d27d94c-e360-4ddd-a040-a0448fce6411 / version 2955a654-cd6b-4ae3-b8a6-d3e9b0e30e87
Smoke: PENDING

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
- `PDF_SIGNING_SECRET` was generated independently and uploaded as a managed secret to both Worker environments; no secret value is recorded here.
- GitHub environments `staging` and `production` exist. Repository secret `CLOUDFLARE_ACCOUNT_ID` is configured without recording its value here.

GITHUB_PRIVATE_REPO_READY=YES (private repo with full history; main + develop pushed)
EXTERNAL_CI_READY=NO
CLOUDFLARE_STAGING_READY=NO
CLOUDFLARE_PRODUCTION_BETA_READY=NO
ACCESS_ALLOWLIST_READY=NO
BETA_FREE_FLOW_READY=YES (local automated evidence only)
AI_OFF_FLOW_READY=YES (local automated evidence only)
BETA_SMOKE_READY=NO

External blockers recorded 2026-09-16:

- GitHub Actions runs start with `startup_failure` and zero jobs on the current private Free-plan account. GitHub branch protection and repository rulesets return `Upgrade to GitHub Pro or make this repository public`.
- Cloudflare Zero Trust Free is initialized and visible in Cloudflare One; Access application/allowlist and hosted beta smoke remain pending until the beta tester email allowlist is supplied.
```

No secret values belong in this file.
