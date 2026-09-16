# ORBITA-30 Final Acceptance

This document is the release checklist for the ORBITA-30 v2 Core60 + Mercury migration. It records executable evidence separately from external approvals. A row is `PASS` only when the referenced artifact exists and the check has actually run; `OPEN` means the gate is outside this repository or has not yet been evidenced; `PARTIAL` means the code covers a material subset but the full acceptance requirement still has an explicit remainder. Older v1 references are retained only as historical evidence.

## Release identity

| Field | Value |
|---|---|
| Source release Git SHA | `071f50fe12adeed6e7bb22fe05e8f39e68adc656` |
| Source package SHA-256 | `bc5d286f889fe41315f0ba1b6fdebc61b4a5ca2252b771a7bed03771603874c7` |
| Source package path | `/Users/nuras/Desktop/gallup/release-artifacts/orbita-30-source-release-071f50f.tar.gz` |
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
| ENG-03 | PASS | `scripts/security-scan.mjs` | `npm run security:scan`, `npm audit --omit=dev --audit-level=high` | No tracked secret findings and no production high/critical audit finding in the recorded run. | Engineering | 2026-09-16 |
| ENG-04 | PASS | `drizzle/0012_adaptive_generation_attempts.sql`, `scripts/check-migration-drift.mjs`, `scripts/backup-restore-smoke.mjs` | `npm run db:check`, `npm run test:backup` | Migration chain 0000–0012 is drift-free and local export/restore smoke passes. | Engineering | 2026-09-16 |
| ENG-05 | OPEN | `.env.example`, `PROJECT_HANDOFF.md` | Deployment configuration review required | Current Site is owner-private; staging/prod resource separation is an operator gate. | Engineering | 2026-09-16 |
| ENG-06 | PASS | `app/orbita-app.tsx`, `app/orbita-view-router.tsx`, `hooks/use-orbita-controller.ts`, `app/orbita-views.tsx`, `hooks/use-assessment-queue.ts` | `npm run lint`, `npx tsc --noEmit`, `npm test`; typed controller and DOM-free queue/routing boundaries | Shell, routing, orchestration, presentation, API and queue responsibilities are separated; server business rules remain outside views. | Engineering | 2026-09-16 |
| TST-01 | PASS | `TEST_MATRIX.md`, `scripts/check-coverage.mjs` | 40 unit/contract tests, fixed-seed property tests, fault tests, load smoke, beta smoke, browser CSP, PDF visual and E2E | Repository test gates are automated; external auth and production-scale capacity remain separate gates. | Engineering | 2026-09-16 |
| TST-02 | PASS | `scripts/e2e-smoke.mjs` | E2E ownership checks | User B receives 404/401 for assessment, report, PDF and export objects. | Engineering | 2026-09-16 |
| TST-03 | PASS | `lib/provider-contract.ts`, `lib/report-safety.ts` | Unit provider failure and injection tests | Empty/malformed/extra text, schema and safety boundaries are covered. | Engineering | 2026-09-16 |
| TST-04 | PASS | `lib/payment-integrity.ts`, `lib/payment-event-policy.ts` | E2E webhook mismatch/replay/race/refund/dispute | No live Stripe business transaction is claimed. | Engineering | 2026-09-16 |
| TST-05 | PASS | `lib/pdf-token-policy.ts`, `scripts/pdf-visual-qa.mjs` | PDF token/tamper/expiry/owner/regeneration E2E plus 4 RU visual fixtures | 4 x 24-page A4 fixtures include analytical, execution, long-text and low-confidence profiles; kk/en remain intentionally unpublished. | Engineering | 2026-09-16 |
| TST-06 | PASS | `lib/retention.ts`, `scripts/e2e-smoke.mjs` | Account/assessment delete, export, retention dry-run, real purge and active-session exclusion | Fixture uses paid entitlements and isolated local D1/R2 state. | Engineering | 2026-09-16 |
| TST-07 | PASS | `scripts/e2e-smoke.mjs` | Restart/resume and idempotent response replay | Server restart occurs during the core flow. | Engineering | 2026-09-16 |
| AUTH-01 | OPEN | `lib/server-auth.ts` | External public identity provider required | Current Sites identity is owner-private/dispatch-owned. | Product / Identity | 2026-09-16 |
| AUTH-02 | OPEN | `lib/server-auth.ts` | External public verified identity acceptance required | No public account creation is fabricated. | Product / Identity | 2026-09-16 |
| AUTH-03 | OPEN | `PROJECT_HANDOFF.md` | Logout/revoke acceptance required | Dispatch-owned session lifecycle is outside the repository. | Product / Identity | 2026-09-16 |
| AUTH-04 | OPEN | `scripts/e2e-smoke.mjs` | Same-device Worker restart is tested | Cross-device public auth is still an external gate. | Product / Identity | 2026-09-16 |
| AUTH-05 | OPEN | `SECURITY_REVIEW.md` | MFA/RBAC deployment acceptance required | Admin is allowlist/read-only aggregate in this release. | Product / Identity | 2026-09-16 |
| SEC-01 | PASS | `lib/security-headers.ts`, `worker/index.ts`, `tests/browser/csp.spec.ts` | Unit + real-browser nonce/CSP assertions | CSP has no `unsafe-inline`/`unsafe-eval` in `script-src`; hydration and checkout pass. | Engineering | 2026-09-16 |
| SEC-02 | PASS | `lib/durable-store.ts` | E2E 429/Retry-After boundary | Limits are server-side and scoped; tuning remains deployment-specific. | Engineering | 2026-09-16 |
| SEC-03 | PASS | `lib/observability.ts`, `scripts/security-scan.mjs` | Structured log shape and scan | Logs omit answers, email, payment data and raw provider output. | Engineering | 2026-09-16 |
| SEC-04 | PASS | `lib/durable-store.ts`, `.openai/hosting.json` | Private R2 binding and owner-checked reads | Hosted access policy must remain private. | Engineering | 2026-09-16 |
| SEC-05 | PASS | `scripts/backup-restore-smoke.mjs` | `BACKUP_RESTORE_SMOKE=PASS` | Local D1 export/restore is tested; managed backup policy remains operational. | Engineering | 2026-09-16 |
| SEC-06 | PASS | `RUNBOOKS.md` | Incident and recovery procedures | Owners and live contact details still need operator assignment. | Engineering | 2026-09-16 |
| PAY-01 | OPEN | `.env.example`, `README.md` | Business-approved price required | No price is invented in source or evidence. | Product / Payments | 2026-09-16 |
| PAY-02 | OPEN | `lib/payment-provider.ts` | Live managed secrets required | Test fixtures use only local test values. | Product / Payments | 2026-09-16 |
| PAY-03 | PASS | `lib/stripe-signature.ts`, `lib/payment-integrity.ts` | Signature, snapshot, replay and race E2E | Grant follows exact order/session/amount/currency/test/payment checks. | Product / Payments | 2026-09-16 |
| PAY-04 | PARTIAL | `lib/payment-event-policy.ts`, `RUNBOOKS.md` | Refund/dispute state transitions and webhook tests | Approved commercial refund policy and support action are external. | Product / Payments | 2026-09-16 |
| PAY-05 | OPEN | `RUNBOOKS.md` | Named support owner/channel required | No support SLA or contact is fabricated. | Product / Payments | 2026-09-16 |
| AI-01 | PASS (local) | `lib/mercury-adaptive-provider.ts`, `lib/orbita-v2-engine.ts` | Core60/Mercury validation and fallback tests | Mercury generates question content only; server-side v2 scoring remains authoritative and production Mercury stays off until staging PASS. | Engineering | 2026-09-16 |
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
| OPS-02 | OPEN | `RUNBOOKS.md` | Transactional notification provider required | No email/SMS provider is wired in this release. | Operations | 2026-09-16 |
| OPS-03 | OPEN | `RUNBOOKS.md` | Approved support channel/SLA required | Contact remains a configuration gate. | Operations | 2026-09-16 |
| OPS-04 | PASS (local gate) | `scripts/load-smoke.mjs` | 94 requests; p50/p95/p99, errors, throughput, 429 and idempotency reported | Local Wrangler/D1 load is not a production capacity claim; target production load remains an operations gate. | Operations | 2026-09-16 |
| OPS-05 | PARTIAL | `lib/ops-monitoring.ts`, `worker/index.ts` | Metrics/cron events exist | Uptime/error alert destination is a deployment task. | Operations | 2026-09-16 |
| OPS-06 | OPEN | `RUNBOOKS.md` | Named on-call rotation required | No person or SLA is invented. | Operations | 2026-09-16 |
| LEG-01 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Written privacy approval required | Runtime legal config still has operator placeholders. | Legal / Operator | 2026-09-16 |
| LEG-02 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Written terms approval required | Runtime legal config still has operator placeholders. | Legal / Operator | 2026-09-16 |
| LEG-03 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Approved refund policy required | Code does not invent refund rights. | Legal / Operator | 2026-09-16 |
| LEG-04 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Research consent approval required | Consent versioning is implemented; approval is not. | Legal / Operator | 2026-09-16 |
| LEG-05 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Similarity/trademark review required | ORBITA-30 is original scope but external review is required. | Legal / Operator | 2026-09-16 |
| LEG-06 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Kazakhstan legal sign-off required | This is a non-automatable launch gate. | Legal / Operator | 2026-09-16 |

## Verification record

| Command | Result | Evidence |
|---|---|---|
| `npm ci` | PASS in locked local checkout; Node runtime recorded in manifest | `.github/workflows/ci.yml`, `package-lock.json` |
| `npm run lint` | PASS | CI/local command output |
| `npx tsc --noEmit` | PASS | CI/local command output |
| `npm test` | PASS | 40 unit/contract/property/fault/routing/queue tests |
| `npm run test:coverage` | PASS | total lib branches 84.88%; critical modules meet 90% gate |
| `npm run check:gates` | PASS | `READY_FOR_ENGINEERING_100=NO` through `READY_FOR_NORMATIVE_PERCENTILES=NO`; `local_release_checks=PASS`; `hosted_ci=MISSING` |
| `npm run test:e2e` | PASS — current-source local run | Full local Worker/D1/R2 smoke, required idempotency key, Core60 + adaptive fallback, response metadata export, restart/resume and retention recovery |
| `npm run test:beta` | PASS | Beta-free entitlement with payments/AI OFF and `normStatus=unvalidated` |
| `npm run test:browser` | PASS | Real browser hydration, strict CSP nonce, navigation and checkout redirect |
| `npm run test:pdf-visual` | PASS | 4 deterministic 24-page A4 fixtures; visual render QA PASS |
| `npm run test:load` | PASS | responses=90 p50=221.5ms p95=2676.7ms p99=2713.3ms; assessment=2 p50=129ms p95=30419.8ms; complete-core=2 p50=236.5ms p95=240ms; error_rate=0; 429=0; retryable_conflicts=5; lost=0; duplicated=0; idempotency=PASS; state=ADAPTIVE_FALLBACK |
| `npm run test:backup` | PASS | `BACKUP_RESTORE_SMOKE=PASS` |
| `npm run build` | PASS | Vinext production build |
| `npm audit --omit=dev --audit-level=high` | PASS | 0 vulnerabilities in recorded local run |
| `npm run db:check` / `npm run test:retention-plan` | PASS | `MIGRATION_DRIFT=PASS`; `RETENTION_QUERY_PLAN=PASS` with `assessments_purge_due_idx`; migration chain through `0012_adaptive_generation_attempts.sql` |
| Linux Node 22.13.0 `release:verify` | PASS | Exact-Git archive reproduced twice; source SHA `071f50fe12adeed6e7bb22fe05e8f39e68adc656`; archive SHA `bc5d286f889fe41315f0ba1b6fdebc61b4a5ca2252b771a7bed03771603874c7` |
| `git status --porcelain` | PASS after evidence commit | Must be empty before deployment |

## Remaining risk register

### P0

None found in the tracked source scan or local ownership/webhook checks. Any future public exposure of R2, auth bypass, secret leak, or score mutation by AI is a release blocker.

### P1

- Clean Linux CI and staging/production resource isolation are not evidenced locally.
- Public multi-user identity, logout/revocation, MFA/RBAC and support controls are not implemented by this private Site.
- Live Stripe price/secrets/refund operations and approved Kazakhstan legal documents are open.
- Production GitHub Actions Linux run, staging/prod resource isolation and managed backup/RPO evidence remain deployment gates. GitHub branch protection/rulesets are also unavailable for this private repository on the current plan; the repository remains private and production is manual-only until plan access is changed.
- The repository PDF matrix is complete for four RU profiles; kk/en remain unpublished until localization review and invariance evidence.

### P2

- kk/EN translations remain unpublished pending independent review and invariance evidence.
- Deployed alert destination, notification provider, support SLA, named on-call and target-load result need operator configuration.
- Psychometric and norming program is unstarted; all scientific/population claims remain disabled.
