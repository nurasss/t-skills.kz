# ORBITA-30 Final Acceptance

> Re-baselining note (2026-09-17): the original checklist recorded the previous v2 release. Later changes added first-party authentication, legal/cookie controls and the current T-Skills runtime. A fail-closed build of the dirty worktree was deployed to `kz-vps` on 2026-10-04; Cloudflare Worker environments and hosted CI remain separate, unevidenced targets. Do not infer a release gate from the historical rows alone.

> Audit refresh (2026-10-04): with Node 22.13.0, locked install, lint, typecheck, 184 tests, 84.82% branch coverage, build, browser CSP, local Worker/D1/R2 E2E, beta, load, backup/restore and PDF visual checks pass. The teen bank review found a v1 left/right score inversion; v2 corrects it and balances side exposure, while a migration preserves the original layout for unfinished v1 sessions. Completed v1 results are marked as affected and are not rewritten. Production dependency audit reports zero findings; the full dependency audit remains blocked by the unpatched dev-only `braces` advisory `GHSA-vfj7-8cjw-p6xm`. Staging config lacks `EMAIL_FROM`; legal approval, hosted CI and external security/operations gates remain open. See `TEEN_ASSESSMENT_REVIEW.md` and `DEPLOYMENT_EVIDENCE.md`.

This document is the release checklist for the ORBITA-30 v2 Core60 + Mercury migration. It records executable evidence separately from external approvals. A row is `PASS` only when the referenced artifact exists and the check has actually run; `OPEN` means the gate is outside this repository or has not yet been evidenced; `PARTIAL` means the code covers a material subset but the full acceptance requirement still has an explicit remainder. Older v1 references are retained only as historical evidence.

## Release identity

| Field | Value |
|---|---|
| Source release Git SHA | `d3ea99fd1cac90b7d76d3fcf5e790a73eaa35f13` |
| Source package SHA-256 | `0e7975c9f9085762e0a56550de35c165bb58956421034ab740ad1b48e3bd0efb` |
| Source package path | `/Users/nuras/Desktop/gallup/release-artifacts/orbita-30-source-release-d3ea99f.tar.gz` |
| Evidence-pack commit | `see final Git HEAD; source identity is frozen in RELEASE_MANIFEST.json` |
| Release date | 2026-09-16 |
| Assessment/item bank | `orbita30_ru_v2` / `core60-v1`, 60 fixed items; legacy v1 Q001–Q300 preserved |
| Scoring/norms | `mvp-0.5-core60` / `unvalidated-v2` |
| Adaptive provider | `mercury-generated-0.1`, Inception Labs `mercury-2.5`, approved fallback |
| Report/prompt/library | `report-0.4` / `mercury-adaptive-v1` / `approved-interpretation-v1` |
| Canonical locale | `ru`; `kk` is canonical but unpublished; `kz` is legacy alias only |

## Gate statuses

```text
READY_FOR_ENGINEERING_100=NO
READY_FOR_CLOSED_PILOT=NO
READY_FOR_PUBLIC_PAID_LAUNCH=NO
READY_FOR_VALIDATED_CLAIMS=NO
READY_FOR_NORMATIVE_PERCENTILES=NO
```

`READY_FOR_ENGINEERING_100` remains `NO` until the external GitHub Actions clean Linux CI job passes. The release archive has now passed a clean Linux Node 22.13.0 checkout and reproducibility verification. The other four statuses remain `NO` because they require external content/legal/operations, public authentication/live payment, psychometric validation, and approved norms respectively. No status is promoted by documentation alone.

The status block is checked by `npm run check:gates`. The evaluator requires the complete requirement checklist, a consistent release manifest, a clean tree, the hosted-CI marker for G0, and signed external evidence files for G1/G2/G3/G3B; documentation alone cannot promote a gate.

## Requirement evidence

| ID | Status | Evidence | Test/artifact | Notes | Owner | Date |
|---|---|---|---|---|---|---|
| ENG-01 | PASS at release | `scripts/package-source.mjs` | `npm run package:source`, `SOURCE_MANIFEST.txt`, clean Git check | Archive excludes dependencies, build output, state and secrets. | Engineering | 2026-09-16 |
| ENG-02 | OPEN | `.github/workflows/ci.yml` | GitHub Actions run required | Workflow is defined; GitHub currently returns `startup_failure` with zero jobs for this private Free-plan repository, so no hosted Linux evidence exists. | Engineering | 2026-09-16 |
| ENG-03 | PARTIAL | `scripts/security-scan.mjs`, `package.json`, `SECURITY_REVIEW.md` | `npm run security:scan`, production-only npm audit | Secret scan and production dependency audit pass; the full dev+runtime audit remains blocked by the unpatched high severity dev-tool `braces` advisory. | Engineering | 2026-10-04 |
| ENG-04 | PASS (local) | `drizzle/0024_teen_scoring_direction_v2.sql`, `scripts/check-migration-drift.mjs`, `scripts/backup-restore-smoke.mjs` | `npm run db:check`, `npm run test:backup`, v1-session migration fixture | Migration chain 0000–0024 has no local drift; local migration/restore checks pass. Managed backup/RPO evidence remains an operational gate. | Engineering | 2026-10-04 |
| ENG-05 | PARTIAL | `.env.example`, `PROJECT_HANDOFF.md`, `DEPLOYMENT_EVIDENCE.md` | Deployment target and release identity evidence | VPS runs image `a2f14aafdb22…`, runtime artifact hash is recorded, migration 0024 and v2 health/catalog/robots checks passed. Source was a dirty worktree without a clean source Git SHA; Cloudflare staging/prod remain Access-protected and current-source deployment is unverified there. | Engineering | 2026-10-04 |
| ENG-06 | PASS | `app/orbita-app.tsx`, `app/orbita-view-router.tsx`, `hooks/use-orbita-controller.ts`, `app/orbita-views.tsx`, `hooks/use-assessment-queue.ts` | `npm run lint`, `npx tsc --noEmit`, `npm test`; typed controller and DOM-free queue/routing boundaries | Shell, routing, orchestration, presentation, API and queue responsibilities are separated; server business rules remain outside views. | Engineering | 2026-09-16 |
| TST-01 | PASS | `TEST_MATRIX.md`, `scripts/check-coverage.mjs` | 184 unit/contract/property/fault/routing/queue tests, 84.82% branch coverage, v2 scoring/E2E/browser/beta checks | Local checks pass; hosted Linux CI, external auth acceptance and production-scale capacity remain separate gates. | Engineering | 2026-10-04 |
| TST-02 | PASS | `scripts/e2e-smoke.mjs` | E2E ownership checks | User B receives 404/401 for assessment, report, PDF and export objects. | Engineering | 2026-09-17 |
| TST-03 | PASS | `lib/provider-contract.ts`, `lib/report-safety.ts` | Unit provider failure and injection tests | Empty/malformed/extra text, schema and safety boundaries are covered. | Engineering | 2026-09-16 |
| TST-04 | PASS | `lib/payment-integrity.ts`, `lib/payment-event-policy.ts`, `lib/stripe-refunds.ts` | E2E webhook mismatch/replay/race, partial/full refund, late paid after refund, dispute; unit refund-list pagination/status validation | No live Stripe business transaction is claimed. | Engineering | 2026-10-04 |
| TST-05 | PASS | `lib/pdf-token-policy.ts`, `scripts/pdf-visual-qa.mjs` | PDF token/tamper/expiry/owner/regeneration E2E plus 4 RU visual fixtures | 4 x 24-page A4 fixtures include analytical, execution, long-text and low-confidence profiles; kk/en remain intentionally unpublished. | Engineering | 2026-09-16 |
| TST-06 | PASS | `lib/retention.ts`, `scripts/e2e-smoke.mjs` | Account/assessment delete, export, retention dry-run, real purge and active-session exclusion | Fixture uses paid entitlements and isolated local D1/R2 state. | Engineering | 2026-09-17 |
| TST-07 | PASS | `scripts/e2e-smoke.mjs` | Restart/resume and idempotent response replay | Server restart occurs during the core flow. | Engineering | 2026-09-17 |
| AUTH-01 | PARTIAL | `lib/server-auth.ts`, `lib/app-auth.ts` | First-party application authentication required | E-mail/password, verified e-mail, opaque sessions and invite-only registration are implemented; production sender/configuration remains open. | Product / Identity | 2026-09-17 |
| AUTH-02 | PARTIAL | `app/api/auth/register/route.ts`, `app/api/auth/verify-email/route.ts` | Verified account creation and recovery acceptance required | Registration, e-mail verification and password reset are implemented; production delivery and acceptance evidence remain open. | Product / Identity | 2026-09-17 |
| AUTH-03 | PARTIAL | `app/api/auth/logout/route.ts`, `lib/app-auth.ts` | Logout/revoke acceptance required | Logout and session revocation are implemented; cross-device acceptance test must be rerun on the current source. | Product / Identity | 2026-09-17 |
| AUTH-04 | PARTIAL | `scripts/e2e-smoke.mjs`, `lib/app-auth.ts` | Restart/resume and session lifecycle test required | Current-source local E2E covers restart/resume and session lifecycle; cross-device acceptance and production delivery evidence remain open. | Product / Identity | 2026-09-17 |
| AUTH-05 | PARTIAL | `app/admin/page.tsx`, `app/app-auth.ts`, `SECURITY_REVIEW.md` | MFA/RBAC deployment acceptance required | Role-gated admin access and allowlist are implemented; MFA and external security review remain open. | Product / Identity | 2026-09-17 |
| SEC-01 | PASS | `lib/security-headers.ts`, `worker/index.ts`, `tests/browser/csp.spec.ts` | Unit + real-browser nonce/CSP assertions | CSP has no `unsafe-inline`/`unsafe-eval` in `script-src`; hydration and checkout pass. | Engineering | 2026-09-16 |
| SEC-02 | PASS | `lib/durable-store.ts` | E2E 429/Retry-After boundary | Limits are server-side and scoped; tuning remains deployment-specific. | Engineering | 2026-09-16 |
| SEC-03 | PASS | `lib/observability.ts`, `scripts/security-scan.mjs` | Structured log shape and scan | Logs omit answers, email, payment data and raw provider output. | Engineering | 2026-09-16 |
| SEC-04 | PASS | `lib/durable-store.ts`, `.openai/hosting.json` | Private R2 binding and owner-checked reads | Hosted access policy must remain private. | Engineering | 2026-09-16 |
| SEC-05 | PASS | `scripts/backup-restore-smoke.mjs` | `BACKUP_RESTORE_SMOKE=PASS` | Local D1 export/restore is tested; managed backup policy remains operational. | Engineering | 2026-09-16 |
| SEC-06 | PASS | `RUNBOOKS.md` | Incident and recovery procedures | Owners and live contact details still need operator assignment. | Engineering | 2026-09-16 |
| PAY-01 | OPEN | `.env.example`, `README.md` | Business-approved price required | No price is invented in source or evidence. | Product / Payments | 2026-09-16 |
| PAY-02 | OPEN | `lib/payment-provider.ts` | Live managed secrets required | Test fixtures use only local test values. | Product / Payments | 2026-09-16 |
| PAY-03 | PASS | `lib/stripe-signature.ts`, `lib/payment-integrity.ts` | Signature, snapshot, replay and race E2E | Grant follows exact order/session/amount/currency/test/payment checks. | Product / Payments | 2026-09-16 |
| PAY-04 | PARTIAL | `lib/payment-event-policy.ts`, `lib/stripe-refunds.ts`, `RUNBOOKS.md` | CSRF-protected admin refund, full/partial/pending/failure event paths and provider refund-list reconciliation | No live Stripe transaction or approved commercial refund policy/support owner is claimed. | Product / Payments | 2026-10-04 |
| PAY-05 | OPEN | `RUNBOOKS.md` | Named support owner/channel required | No support SLA or contact is fabricated. | Product / Payments | 2026-09-16 |
| AI-01 | PASS | `lib/mercury-adaptive-provider.ts`, `lib/orbita-v2-engine.ts`, `DEPLOYMENT_EVIDENCE.md` | Core60/Mercury validation and fallback tests plus authenticated staging smoke | Live staging generated 12 adaptive questions with Inception Labs `mercury-2.5` (`provider=inception-labs`, `attempts=1`, no fallback); server-side v2 scoring remains authoritative and production Mercury stays off. | Engineering | 2026-09-16 |
| AI-02 | PASS | `lib/provider-contract.ts`, `tests/unit.test.ts` | Provider failure and malformed-output tests | Fallback is structured and auditable. | Engineering | 2026-09-16 |
| AI-03 | PASS | `lib/report-safety.ts`, `lib/report-provider.ts` | Source-key, forbidden-claim and prompt-injection tests | Frozen score and approved library are authoritative. | Engineering | 2026-09-16 |
| AI-04 | PARTIAL | `lib/ops-monitoring.ts`, `lib/analytics.ts` | Telemetry and alert helper tests | A deployed alert sink and on-call escalation are not configured. | Engineering | 2026-09-16 |
| AI-05 | PASS | `lib/assessment-engine.ts`, `lib/report-provider.ts` | Version snapshot and provider contract checks | Model/prompt/report/library versions are persisted where applicable. | Engineering | 2026-09-16 |
| PSY-01 | OPEN | `PILOT_PROTOCOL.md` | External qualified-review record required | No expert review is claimed. | Science / Validation | 2026-09-16 |
| PSY-02 | OPEN | `PILOT_PROTOCOL.md` | External cognitive interview record required | No participant data is fabricated. | Science / Validation | 2026-09-16 |
| PSY-03 | OPEN | `PILOT_PROTOCOL.md` | External pilot sample N≥500 required | Synthetic E2E data is not evidence. | Science / Validation | 2026-09-16 |
| PSY-04 | OPEN | `PREREGISTRATION.md` | Reliability/retest analysis required | Norm-safe MVP claims remain disabled. | Science / Validation | 2026-09-16 |
| PSY-05 | OPEN | `PREREGISTRATION.md` | Factor analysis required | Model choice is data-dependent. | Science / Validation | 2026-09-16 |
| PSY-06 | OPEN | `PREREGISTRATION.md` | Validity evidence required | No validated construct claim is made. | Science / Validation | 2026-09-16 |
| PSY-07 | OPEN | `PREREGISTRATION.md` | DIF/fairness evidence required | Language and subgroup invariance are not established. | Science / Validation | 2026-09-16 |
| PSY-08 | OPEN | `PREREGISTRATION.md` | Calibration evidence required | Adaptive information is proxy-based until calibration. | Science / Validation | 2026-09-16 |
| PSY-09 | OPEN | `NORMING_REPORT.md` | Norm sample/tables required | No percentiles are available. | Science / Validation | 2026-09-16 |
| PSY-10 | OPEN | `PREREGISTRATION.md` | Independent cross-validation required | No external review is claimed. | Science / Validation | 2026-09-16 |
| LOC-01 | PASS | `lib/i18n.ts`, `drizzle/0010_clever_unicorn.sql` | Unit/E2E canonical `kz → kk` checks | New persisted locale values are canonical. | Product / Localization | 2026-09-16 |
| LOC-02 | PASS | `PILOT_PROTOCOL.md`, `lib/i18n.ts` | Versioned translation metadata | RU source remains authoritative for pilot. | Product / Localization | 2026-09-16 |
| LOC-03 | OPEN | `PILOT_PROTOCOL.md` | kk translation/cognitive review required | Locale is intentionally unpublished. | Product / Localization | 2026-09-16 |
| LOC-04 | OPEN | `PILOT_PROTOCOL.md` | EN translation/cognitive review required | Locale is intentionally unpublished. | Product / Localization | 2026-09-16 |
| LOC-05 | OPEN | `PREREGISTRATION.md` | Measurement invariance required | No cross-language pooling is enabled. | Product / Localization | 2026-09-16 |
| LOC-06 | PASS | `lib/i18n.ts`, `lib/assessment-engine.ts` | Unvalidated norm/version boundary | Norm versions are language/population-specific by policy. | Product / Localization | 2026-09-16 |
| OPS-01 | PASS | `lib/observability.ts`, `lib/ops-monitoring.ts` | Structured request logs and SLO helper tests | No external alert sink is implied. | Operations | 2026-09-16 |
| OPS-02 | PARTIAL | `lib/email.ts`, `RUNBOOKS.md` | Transactional notification provider required | Resend delivery is wired server-side; verified sender, secret and production delivery evidence remain open. | Operations | 2026-09-17 |
| OPS-03 | OPEN | `RUNBOOKS.md` | Approved support channel/SLA required | Contact remains a configuration gate. | Operations | 2026-09-16 |
| OPS-04 | PASS (local gate) | `scripts/load-smoke.mjs` | 97 requests; p50/p95/p99, errors, throughput, 429 and idempotency reported | Local Wrangler/D1 load is not a production capacity claim; target production load remains an operations gate. | Operations | 2026-09-17 |
| OPS-05 | PARTIAL | `lib/ops-monitoring.ts`, `worker/index.ts` | Metrics/cron events exist | Uptime/error alert destination is a deployment task. | Operations | 2026-09-16 |
| OPS-06 | OPEN | `RUNBOOKS.md` | Named on-call rotation required | No person or SLA is invented. | Operations | 2026-09-16 |
| LEG-01 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Written privacy approval required | Runtime legal config still has operator placeholders. | Legal / Operator | 2026-09-16 |
| LEG-02 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Written terms approval required | Runtime legal config still has operator placeholders. | Legal / Operator | 2026-09-16 |
| LEG-03 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Approved refund policy required | Code does not invent refund rights. | Legal / Operator | 2026-09-16 |
| LEG-04 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Research consent approval required | Consent versioning is implemented; approval is not. | Legal / Operator | 2026-09-16 |
| LEG-05 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Similarity/trademark review required | ORBITA-30 is original scope but external review is required. | Legal / Operator | 2026-09-16 |
| LEG-06 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Kazakhstan legal sign-off required | This is a non-automatable launch gate. | Legal / Operator | 2026-09-16 |

## Historical verification record (2026-09-17)

| Command | Result | Evidence |
|---|---|---|
| `npm ci` | PASS in locked local checkout; Node runtime recorded in manifest | `.github/workflows/ci.yml`, `package-lock.json` |
| `npm run lint` | PASS | CI/local command output |
| `npx tsc --noEmit` | PASS | CI/local command output |
| `npm test` | PASS | 51 unit/contract/property/fault/routing/queue tests |
| `npm run test:coverage` | PASS | total lib branch coverage 83.29%; configured critical-module gates pass |
| `npm run check:gates` | NOT RUN — expected NO while worktree is dirty | The gate intentionally requires a clean tree; run it from the clean release checkout after these changes are committed and the external CI marker is available. |
| `npm run test:e2e` | PASS — current-source local run | Full local Worker/D1/R2 smoke, required idempotency key, Core60 + adaptive fallback, response metadata export, restart/resume and retention recovery |
| `npm run test:beta` | PASS | Beta-free entitlement with payments/AI OFF and `normStatus=unvalidated` |
| `npm run test:browser` | PASS | Real browser hydration, strict CSP nonce, navigation and checkout redirect |
| `npm run test:pdf-visual` | PASS | 4 deterministic 24-page A4 fixtures; visual render QA PASS |
| `npm run test:load` | PASS | responses=97 p50=193.5ms p95=1594.6ms p99=1639ms; assessment=2 p50=42.7ms p95=85.6ms; complete-core=2 p50=220.3ms p95=264.8ms; error_rate=0; 429=0; retryable_conflicts=12; lost=0; duplicated=0; idempotency=PASS; state=ADAPTIVE_FALLBACK |
| `npm run test:backup` | PASS | `BACKUP_RESTORE_SMOKE=PASS` |
| `npm run build` | PASS | Vinext production build |
| `npm run audit:check` | PASS | 0 runtime and development vulnerabilities in the recorded 2026-09 run |
| `npm run db:check` / `npm run test:retention-plan` | PASS — current-source local run | `MIGRATION_DRIFT=PASS`; `RETENTION_QUERY_PLAN=PASS index=assessments_purge_due_idx`; current chain includes `0024_teen_scoring_direction_v2.sql`. |
| `npx wrangler secret list --env staging` | PASS | Managed secret names include `INCEPTION_API_KEY` and `PDF_SIGNING_SECRET`; values are never recorded |
| `npx wrangler d1 migrations apply DB --remote --env staging` | STALE | Previous Cloudflare evidence covered `0011`–`0012`; the current dirty source through `0024` has not been deployed to that environment. |
| `npx wrangler deploy --env staging` | PASS | Worker `orbita-30-staging`, version `7c31c70a-33c4-4d82-807a-b811e3f31b95`, 100% traffic |
| Authenticated staging v2 smoke | PASS | Health/catalog 200; 60 Core responses; live Mercury 2.5 returned 12 questions in 1 attempt (~2.8s); report 200 with `adaptiveFallbackUsed=false`; signed PDF 200, 49,362 bytes |
| Linux Node 22.13.0 `release:verify` | PASS | Exact-Git archive reproduced twice; source SHA `d3ea99fd1cac90b7d76d3fcf5e790a73eaa35f13`; archive SHA `0e7975c9f9085762e0a56550de35c165bb58956421034ab740ad1b48e3bd0efb` |
| `git status --porcelain` | EXPECTED DIRTY | The deliverable worktree contains the requested changes; it must be clean only in the release checkout used for deployment. |

## Remaining risk register

### P0

None found in the tracked source scan or local ownership/webhook checks. Any future public exposure of R2, auth bypass, secret leak, or score mutation by AI is a release blocker.

### P1

- Clean Linux CI and staging/production resource isolation are not evidenced locally.
- First-party multi-user identity, logout/revocation and role-gated admin access are implemented; MFA, support operations and external security review remain open for launch.
- Live Stripe price/secrets/refund operations and approved Kazakhstan legal documents are open.
- Production GitHub Actions Linux run, staging/prod resource isolation and managed backup/RPO evidence remain deployment gates. GitHub branch protection/rulesets are also unavailable for this private repository on the current plan; the repository remains private and production is manual-only until plan access is changed.
- The repository PDF matrix is complete for four RU profiles; kk/en remain unpublished until localization review and invariance evidence.

### P2

- kk/EN translations remain unpublished pending independent review and invariance evidence.
- Deployed alert destination, notification provider, support SLA, named on-call and target-load result need operator configuration.
- Psychometric and norming program is unstarted; all scientific/population claims remain disabled.
