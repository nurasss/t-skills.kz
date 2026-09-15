# ORBITA-30 Data Privacy Review

Status: engineering/data-flow review for a private pilot. Legal sufficiency and Kazakhstan-specific approval are external gates.

## Data inventory and boundaries

| Data | Storage | Access boundary | Retention/deletion |
|---|---|---|---|
| Dispatch user ID, email, optional encoded full name | D1 `users` | Server-side current viewer; no client-owned identity | Account delete anonymizes identity fields and soft-deletes account |
| Order/payment references and status | D1 `orders`, `payment_events`, `entitlements` | Owner for account view; signed provider webhook for event ingress | Account delete removes user-owned commercial rows; statutory/processor retention must be approved externally |
| Assessment state, locale, version snapshot | D1 `assessments` | `user_id` predicate on every object route | Assessment delete physically purges the assessment and dependent rows |
| Raw answers and response times | D1 `assessment_responses` | Owner-scoped session APIs; never general analytics | Assessment/account delete purges rows; retention excludes active states |
| Consent decisions/version | D1 `consents` | Owner-scoped session/account export | Deleted with assessment/account rows |
| Frozen score/report JSON and version metadata | D1 `reports` | Owner-scoped report APIs | R2 PDF is deleted before D1 report row on delete |
| PDF report artifact | Private R2 `reports/{user}/{report}.pdf` | Signed five-minute grant plus owner check | R2 delete first in assessment/account/retention paths |
| Export artifact | Private R2 `exports/{user}/{request}.json` | Owner-scoped request ID | R2 delete is attempted on account deletion; policy/backup expiry must be approved |
| Adaptive/report structured runs | D1 `adaptive_runs` and report snapshot metadata | Owner/account export; no raw provider output by default | Deleted with assessment/account; no PII sent to optional provider |
| Analytics/operational telemetry | D1 `telemetry_events` | Aggregate/admin paths; allowlisted metadata | No raw answers, email or secrets; account delete removes user-linked events |
| Audit events | D1 `audit_events` | Internal operational access | Pseudonymous metadata only; legal retention period is an external decision |

## Processing controls

- The backend is the source of truth for identity, ownership, payment, consent, scoring and deletion. URL IDs are never treated as authorization.
- `lib/analytics.ts` allowlists metadata and discards raw-answer/email/arbitrary payload fields. `lib/observability.ts` logs normalized routes, request ID, status, latency and error code only.
- Optional AI providers receive frozen structured score/provisional trait statistics and approved semantics, not raw answers or identity/contact/payment references. `store:false` is set for the Responses API request; provider contracts reject non-JSON and unsupported claims.
- `kz` is accepted only as a legacy input alias and canonicalized to `kk`; current `kk`/EN item translations are unpublished until translation, cognitive and invariance review.
- PDF and export responses use private/no-store or private cache headers; R2 binding is not public in the source configuration.

## Export/delete semantics

`POST /api/account/export` builds an owner-scoped artifact containing the user record, orders, assessments, responses, reports, adaptive run metadata and consent decisions. The returned request ID is checked against the current user before R2 read.

`POST /api/account/delete` creates a privacy request, deletes report/export R2 artifacts first, then deletes answer, adaptive, consent, report, assessment, entitlement, payment-event, order, telemetry and rate-limit rows, and finally anonymizes the user row. `DELETE /api/assessments/:id` applies the same R2-before-D1 order to one owned assessment. Failures are marked retryable and do not claim completion.

## Retention and backups

The Worker cron runs `runRetentionSweep`. Dry-run is the default when no explicit configuration is supplied. Candidates are older than the configured period and exclude `CREATED`, `PAYMENT_PENDING`, `PAID`, `CONSENTED`, `CORE_IN_PROGRESS`, `ADAPTIVE_SELECTING` and `ADAPTIVE_IN_PROGRESS`. R2 artifacts are removed before dependent D1 rows; the operation is idempotent and records a pseudonymous audit event.

`npm run test:backup` proves a local D1 export and restore. Managed backup expiry, RPO/RTO, backup encryption, and whether deleted data remains in backups must be documented by the operator before G2. The repository does not claim immediate erasure from immutable provider backups.

## Open decisions

- Legal entity, purposes, categories, processors, cross-border processing, user rights, retention period and support contact are still configuration/approval fields.
- The public identity provider, session revocation, MFA/RBAC, incident notification process and production alert destination are not implemented by this private Site.
- No research demographics are collected by the current core flow; any pilot demographics must be separately consented, coarse and justified in the approved protocol.
