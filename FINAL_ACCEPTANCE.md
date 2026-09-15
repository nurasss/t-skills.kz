# ORBITA-30 Final Acceptance

This document is the release checklist for the ORBITA-30 MASTER ТЗ v2.0. It records executable evidence separately from external approvals. A row is `PASS` only when the referenced artifact exists and the check has actually run; `OPEN` means the gate is outside this repository or has not yet been evidenced; `PARTIAL` means the code covers a material subset but the full acceptance requirement still has an explicit remainder.

## Release identity

| Field | Value |
|---|---|
| Source release Git SHA | `bf29682e6e41046516d7cc98bb9b493d25e26d30` |
| Source package SHA-256 | `3c99b3bab0b040b4b5a50636684e7545238290a78e551a75df23cb1af57141d2` |
| Evidence-pack commit | `6c1bdd5183f9397751223076a68e1f4c62ccc470` |
| Release date | 2026-09-16 |
| Assessment/item bank | `orbita30_ru_v1` / `draft-pilot-v1`, Q001–Q300 frozen |
| Scoring/norms | `mvp-0.4-norm-safe` / `pilot-index-unvalidated-v1` |
| Adaptive selector | `selector-0.3`, deterministic fallback, optional provider |
| Report/prompt/library | `report-0.3` / `report-writer-0.3` / `approved-interpretation-v1` |
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

## Requirement evidence

| ID | Status | Evidence | Test/artifact | Notes |
|---|---|---|---|---|
| ENG-01 | PASS at release | `scripts/package-source.mjs` | `npm run package:source`, `SOURCE_MANIFEST.txt`, clean Git check | Archive excludes dependencies, build output, state and secrets. |
| ENG-02 | OPEN | `.github/workflows/ci.yml` | GitHub Actions run required | Workflow is defined; this local Mac run is not Linux evidence. |
| ENG-03 | PASS | `scripts/security-scan.mjs` | `npm run security:scan`, `npm audit --omit=dev --audit-level=high` | No tracked secret findings and no production high/critical audit finding in the recorded run. |
| ENG-04 | PASS | `drizzle/0007_tough_gorgon.sql`, `scripts/backup-restore-smoke.mjs` | `npm run db:generate`, `npm run test:backup` | Locale migration and local export/restore smoke are evidenced. |
| ENG-05 | OPEN | `.env.example`, `PROJECT_HANDOFF.md` | Deployment configuration review required | Current Site is owner-private; staging/prod resource separation is an operator gate. |
| TST-01 | PASS | `TEST_MATRIX.md`, `scripts/check-coverage.mjs` | 32 unit/contract tests, fixed-seed property tests, fault tests, load smoke, browser CSP and E2E | Repository test gates are automated; external auth and production-scale capacity remain separate gates. |
| TST-02 | PASS | `scripts/e2e-smoke.mjs` | E2E ownership checks | User B receives 404/401 for assessment, report, PDF and export objects. |
| TST-03 | PASS | `lib/provider-contract.ts`, `lib/report-safety.ts` | Unit provider failure and injection tests | Empty/malformed/extra text, schema and safety boundaries are covered. |
| TST-04 | PASS | `lib/payment-integrity.ts`, `lib/payment-event-policy.ts` | E2E webhook mismatch/replay/race/refund/dispute | No live Stripe business transaction is claimed. |
| TST-05 | PASS | `lib/pdf-token-policy.ts`, `scripts/pdf-visual-qa.mjs` | PDF token/tamper/expiry/owner/regeneration E2E plus 4 RU visual fixtures | 4 x 24-page A4 fixtures include analytical, execution, long-text and low-confidence profiles; kk/en remain intentionally unpublished. |
| TST-06 | PASS | `lib/retention.ts`, `scripts/e2e-smoke.mjs` | Account/assessment delete, export, retention dry-run, real purge and active-session exclusion | Fixture uses paid entitlements and isolated local D1/R2 state. |
| TST-07 | PASS | `scripts/e2e-smoke.mjs` | Restart/resume and idempotent response replay | Server restart occurs during the core flow. |
| AUTH-01 | OPEN | `lib/server-auth.ts` | External public identity provider required | Current Sites identity is owner-private/dispatch-owned. |
| AUTH-02 | OPEN | `lib/server-auth.ts` | External public verified identity acceptance required | No public account creation is fabricated. |
| AUTH-03 | OPEN | `PROJECT_HANDOFF.md` | Logout/revoke acceptance required | Dispatch-owned session lifecycle is outside the repository. |
| AUTH-04 | OPEN | `scripts/e2e-smoke.mjs` | Same-device Worker restart is tested | Cross-device public auth is still an external gate. |
| AUTH-05 | OPEN | `SECURITY_REVIEW.md` | MFA/RBAC deployment acceptance required | Admin is allowlist/read-only aggregate in this release. |
| SEC-01 | PASS | `lib/security-headers.ts`, `worker/index.ts`, `tests/browser/csp.spec.ts` | Unit + real-browser nonce/CSP assertions | CSP has no `unsafe-inline`/`unsafe-eval` in `script-src`; hydration and checkout pass. |
| SEC-02 | PASS | `lib/durable-store.ts` | E2E 429/Retry-After boundary | Limits are server-side and scoped; tuning remains deployment-specific. |
| SEC-03 | PASS | `lib/observability.ts`, `scripts/security-scan.mjs` | Structured log shape and scan | Logs omit answers, email, payment data and raw provider output. |
| SEC-04 | PASS | `lib/durable-store.ts`, `.openai/hosting.json` | Private R2 binding and owner-checked reads | Hosted access policy must remain private. |
| SEC-05 | PASS | `scripts/backup-restore-smoke.mjs` | `BACKUP_RESTORE_SMOKE=PASS` | Local D1 export/restore is tested; managed backup policy remains operational. |
| SEC-06 | PASS | `RUNBOOKS.md` | Incident and recovery procedures | Owners and live contact details still need operator assignment. |
| PAY-01 | OPEN | `.env.example`, `README.md` | Business-approved price required | No price is invented in source or evidence. |
| PAY-02 | OPEN | `lib/payment-provider.ts` | Live managed secrets required | Test fixtures use only local test values. |
| PAY-03 | PASS | `lib/stripe-signature.ts`, `lib/payment-integrity.ts` | Signature, snapshot, replay and race E2E | Grant follows exact order/session/amount/currency/test/payment checks. |
| PAY-04 | PARTIAL | `lib/payment-event-policy.ts`, `RUNBOOKS.md` | Refund/dispute state transitions and webhook tests | Approved commercial refund policy and support action are external. |
| PAY-05 | OPEN | `RUNBOOKS.md` | Named support owner/channel required | No support SLA or contact is fabricated. |
| AI-01 | PASS | `lib/adaptive-provider.ts`, `lib/adaptive-contract.ts` | Adaptive contract and selection tests | AI is constrained to Q251–Q300; deterministic selector remains authoritative. |
| AI-02 | PASS | `lib/provider-contract.ts`, `tests/unit.test.ts` | Provider failure and malformed-output tests | Fallback is structured and auditable. |
| AI-03 | PASS | `lib/report-safety.ts`, `lib/report-provider.ts` | Source-key, forbidden-claim and prompt-injection tests | Frozen score and approved library are authoritative. |
| AI-04 | PARTIAL | `lib/ops-monitoring.ts`, `lib/analytics.ts` | Telemetry and alert helper tests | A deployed alert sink and on-call escalation are not configured. |
| AI-05 | PASS | `lib/assessment-engine.ts`, `lib/report-provider.ts` | Version snapshot and provider contract checks | Model/prompt/report/library versions are persisted where applicable. |
| PSY-01 | OPEN | `PILOT_PROTOCOL.md` | External qualified-review record required | No expert review is claimed. |
| PSY-02 | OPEN | `PILOT_PROTOCOL.md` | External cognitive interview record required | No participant data is fabricated. |
| PSY-03 | OPEN | `PILOT_PROTOCOL.md` | External pilot sample N≥500 required | Synthetic E2E data is not evidence. |
| PSY-04 | OPEN | `PREREGISTRATION.md` | Reliability/retest analysis required | Norm-safe MVP claims remain disabled. |
| PSY-05 | OPEN | `PREREGISTRATION.md` | Factor analysis required | Model choice is data-dependent. |
| PSY-06 | OPEN | `PREREGISTRATION.md` | Validity evidence required | No validated construct claim is made. |
| PSY-07 | OPEN | `PREREGISTRATION.md` | DIF/fairness evidence required | Language and subgroup invariance are not established. |
| PSY-08 | OPEN | `PREREGISTRATION.md` | Calibration evidence required | Adaptive information is proxy-based until calibration. |
| PSY-09 | OPEN | `NORMING_REPORT.md` | Norm sample/tables required | No percentiles are available. |
| PSY-10 | OPEN | `PREREGISTRATION.md` | Independent cross-validation required | No external review is claimed. |
| LOC-01 | PASS | `lib/i18n.ts`, `drizzle/0007_tough_gorgon.sql` | Unit/E2E canonical `kz → kk` checks | New persisted locale values are canonical. |
| LOC-02 | PASS | `PILOT_PROTOCOL.md`, `lib/i18n.ts` | Versioned translation metadata | RU source remains authoritative for pilot. |
| LOC-03 | OPEN | `PILOT_PROTOCOL.md` | kk translation/cognitive review required | Locale is intentionally unpublished. |
| LOC-04 | OPEN | `PILOT_PROTOCOL.md` | EN translation/cognitive review required | Locale is intentionally unpublished. |
| LOC-05 | OPEN | `PREREGISTRATION.md` | Measurement invariance required | No cross-language pooling is enabled. |
| LOC-06 | PASS | `lib/i18n.ts`, `lib/assessment-engine.ts` | Unvalidated norm/version boundary | Norm versions are language/population-specific by policy. |
| OPS-01 | PASS | `lib/observability.ts`, `lib/ops-monitoring.ts` | Structured request logs and SLO helper tests | No external alert sink is implied. |
| OPS-02 | OPEN | `RUNBOOKS.md` | Transactional notification provider required | No email/SMS provider is wired in this release. |
| OPS-03 | OPEN | `RUNBOOKS.md` | Approved support channel/SLA required | Contact remains a configuration gate. |
| OPS-04 | PASS (local gate) | `scripts/load-smoke.mjs` | 275 requests; p50/p95/p99, errors, throughput, 429 and idempotency reported | Local Wrangler/D1 load is not a production capacity claim; target production load remains an operations gate. |
| OPS-05 | PARTIAL | `lib/ops-monitoring.ts`, `worker/index.ts` | Metrics/cron events exist | Uptime/error alert destination is a deployment task. |
| OPS-06 | OPEN | `RUNBOOKS.md` | Named on-call rotation required | No person or SLA is invented. |
| LEG-01 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Written privacy approval required | Runtime legal config still has operator placeholders. |
| LEG-02 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Written terms approval required | Runtime legal config still has operator placeholders. |
| LEG-03 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Approved refund policy required | Code does not invent refund rights. |
| LEG-04 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Research consent approval required | Consent versioning is implemented; approval is not. |
| LEG-05 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Similarity/trademark review required | ORBITA-30 is original scope but external review is required. |
| LEG-06 | OPEN | `LEGAL_LAUNCH_APPROVAL.md` | Kazakhstan legal sign-off required | This is a non-automatable launch gate. |

## Verification record

| Command | Result | Evidence |
|---|---|---|
| `npm ci` | PASS in locked local checkout; Node runtime recorded in manifest | `.github/workflows/ci.yml`, `package-lock.json` |
| `npm run lint` | PASS | CI/local command output |
| `npx tsc --noEmit` | PASS | CI/local command output |
| `npm test` | PASS | 32 unit/contract/property/fault/routing/queue tests |
| `npm run test:coverage` | PASS | total lib branches 88.67%; critical modules meet 90% gate |
| `npm run test:e2e` | PASS — current run `sess_a97030cb0ef5491aa66fc6e6` | Full local Worker/D1/R2 smoke, restart/resume and retention recovery |
| `npm run test:browser` | PASS | Real browser hydration, strict CSP nonce, navigation and checkout redirect |
| `npm run test:pdf-visual` | PASS | 4 deterministic 24-page A4 fixtures; visual render QA PASS |
| `npm run test:load` | PASS | 275 requests; lost=0, duplicated=0, idempotency=PASS |
| `npm run test:backup` | PASS | `BACKUP_RESTORE_SMOKE=PASS` |
| `npm run build` | PASS | Vinext production build |
| `npm audit --omit=dev --audit-level=high` | PASS | 0 vulnerabilities in recorded local run |
| `npm run db:check` / `npm run test:retention-plan` | PASS | `MIGRATION_DRIFT=PASS`; `RETENTION_QUERY_PLAN=PASS` with `assessments_purge_due_idx` |
| Docker clean-room release archive | PASS | Linux Node 22.13.0: locked install, lint, typecheck, 32 tests, coverage, migration check, build, retention plan, backup/restore, E2E and load |
| Docker Node 22.13.0 `release:verify` | PASS | exact-Git archive reproduced twice; manifest SHA `3c99b3bab0b0...57141d2` |
| `git status --porcelain` | PASS after evidence commit | Must be empty before deployment |

## Remaining risk register

### P0

None found in the tracked source scan or local ownership/webhook checks. Any future public exposure of R2, auth bypass, secret leak, or score mutation by AI is a release blocker.

### P1

- Clean Linux CI and staging/production resource isolation are not evidenced locally.
- Public multi-user identity, logout/revocation, MFA/RBAC and support controls are not implemented by this private Site.
- Live Stripe price/secrets/refund operations and approved Kazakhstan legal documents are open.
- Production GitHub Actions Linux run, staging/prod resource isolation and managed backup/RPO evidence remain deployment gates.
- The repository PDF matrix is complete for four RU profiles; kk/en remain unpublished until localization review and invariance evidence.

### P2

- kk/EN translations remain unpublished pending independent review and invariance evidence.
- Deployed alert destination, notification provider, support SLA, named on-call and target-load result need operator configuration.
- Psychometric and norming program is unstarted; all scientific/population claims remain disabled.
