# T-Skills Risk-Critical Test Matrix

The matrix is intentionally scenario-based. Line coverage is not used as the release criterion. The local E2E suite uses an isolated Wrangler D1/R2 state directory and only local test secrets.

| Area | Scenario | Expected result | Evidence |
|---|---|---|---|
| Frontend architecture | Render a view with injected props | Presentation layer has no network/scoring/payment side effects | `app/orbita-view-router.tsx`, `app/orbita-views.tsx`, `npm run lint`, `npx tsc --noEmit` |
| Frontend architecture | Execute assessment flow actions through the controller | Flow/network/WebMCP orchestration is isolated from the shell and view components | `hooks/use-orbita-controller.ts`, `app/orbita-app.tsx` |
| Frontend architecture | Persist/retry a response | Queue remains deterministic and DOM-free | `hooks/use-assessment-queue.ts`, `lib/response-retry-queue.ts`, `tests/retry-queue.test.ts` |
| Accessibility | Critical text/button color pairs | Solid text pairs meet WCAG AA text contrast target; focus-visible and keyboard paths are covered separately | `scripts/check-contrast.mjs`, `npm run contrast:check`, browser smoke |
| Scoring | Same response map scored twice | Byte-equivalent deterministic profile | `tests/unit.test.ts` — deterministic scoring |
| Scoring | Reverse Likert and forced-choice direction | Direction is preserved | `tests/unit.test.ts` |
| Scoring | Legacy percentile/CI snapshot | Normalized to profile index/uncertainty range; no percentile | `tests/unit.test.ts` |
| Quality | Modal straight-line, too-fast, research-only markers | Flags are explicit and do not silently alter score | `tests/unit.test.ts` |
| Core60 | Exactly 60 fixed items, 30 traits, 6 domains, 30/30 formats | Unique/versioned IDs, complete coverage and deterministic mapping | `lib/v2-item-bank.ts`, `tests/v2-core60.test.ts` |
| v2 scoring | Same Core60 + frozen adaptive answers and versions | Byte-equivalent deterministic preliminary/final profile; bounded refinement only | `lib/orbita-v2-engine.ts`, `tests/v2-core60.test.ts` |
| Adaptive | Mercury generates 10–15 new items | Server count/trait/reason/format/safety/duplicate validation; no score weights | `lib/mercury-adaptive-provider.ts`, `tests/mercury-adaptive.test.ts` |
| Adaptive fallback | Missing secret, timeout, 429, 5xx, malformed/invalid output | At most two provider attempts, then deterministic approved fallback | `lib/mercury-adaptive-provider.ts`, `tests/mercury-adaptive.test.ts` |
| Adaptive persistence | Reload during generation or after AI-04 | Immutable item snapshots, response source and generation lock prevent duplicate generation | `lib/durable-store.ts`, `db/schema.ts`, `scripts/e2e-smoke.mjs` |
| T-Skills Teen active runtime | Versioned entitlement → consent/onboarding → 75 pairs → 8 clarifications → score/careers/report | Current published teen version completes through the API with server-owned scoring and career snapshot | `scripts/e2e-smoke.mjs`, `lib/durable-store.ts`, `tests/t-skills-teen-runtime.test.ts` |
| Report safety | Prompt injection, unsupported source key, forbidden score/percentile/clinical language | Validator rejects; approved library remains authority | `tests/unit.test.ts`, `lib/report-safety.ts` |
| Report safety | Numeric/top-strength mutation | Canonical profile values and source keys are required | `lib/report-provider.ts`, `lib/report-safety.ts` |
| Payment | Valid signed checkout completion | Exact snapshot match before entitlement | `scripts/e2e-smoke.mjs`, `lib/payment-integrity.ts` |
| Payment | Bad/expired signature | Safe reject; no entitlement | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Payment | Wrong amount/currency/session/test | 409/safe reject; no grant | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Payment | Replay and concurrent duplicate events | One accepted grant, duplicate is idempotent | `scripts/e2e-smoke.mjs` |
| Payment | Late paid after full refund | Refund status stays monotonic and no entitlement is created or reactivated | `scripts/e2e-smoke.mjs`, `lib/durable-store.ts` |
| Payment/refunds | Partial charge refund, failed refund, cumulative full refund | Partial refund preserves access; full refund revokes access and releases campaign membership | `scripts/e2e-smoke.mjs`, `lib/payment-event-policy.ts` |
| Admin refund health | Pending refund follows a completed partial refund | Dashboard counts the pending attempt, clears it after failure/resolution, counts the provider failure once per order and retains partial status | `scripts/e2e-smoke.mjs`, `lib/admin-store.ts` |
| Stripe refund lookup | Pagination, succeeded amount sum, pending state, invalid currency, over-refund and page cap | Only confirmed succeeded amounts count; pending or malformed provider state blocks another refund | `tests/stripe-refunds.test.ts`, `lib/stripe-refunds.ts` |
| Admin refunds | Missing CSRF or Stripe key | Request is rejected before the order, entitlement or campaign state changes | `scripts/e2e-smoke.mjs`, refund route |
| Payment | Late failure after paid, dispute, dispute close | Monotonic operational status and audit/telemetry event | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Payment/campaign capacity | Provider-backed reservation passes local TTL before async webhook | Promo use and campaign seat remain reserved until signed provider success/failure/expiry; overdue order without an attached session is released | `scripts/e2e-smoke.mjs`, `tests/campaign-concurrency-and-lifecycle.test.ts` |
| Admin capacity metrics | Reserved checkout passes local TTL | Campaign list/detail/dashboard and promo list/detail show held seats/uses and correct remaining capacity | `scripts/e2e-smoke.mjs` |
| Admin RBAC | Two concurrent attempts to revoke the final SUPER_ADMIN role | At least one active SUPER_ADMIN assignment remains | `tests/database-integrity.test.ts`, `lib/admin-store.ts` |
| CMS | FAQ draft, version compare-and-swap and stale publication | FAQ title/items validate; a stale version returns 409 and only the current draft is published | `tests/cms.test.ts`, `scripts/e2e-smoke.mjs`, `lib/admin-store.ts`, `app/admin/cms-studio.tsx` |
| Auth/ownership | Anonymous account request | 401 | `scripts/e2e-smoke.mjs` |
| Auth environment | `APP_ENV` and `ORBITA_ENV` disagree or are absent | Development preview identity, fallback rate-limit salt, email suppression and fault injection remain disabled | `tests/auth.test.ts`, `lib/auth-utils.ts` |
| Auth/ownership | User B guesses A assessment/report/export ID | 404 and no payload disclosure | `scripts/e2e-smoke.mjs` |
| Auth/ownership | User B reuses A signed PDF token | 401 | `scripts/e2e-smoke.mjs` |
| Auth/ownership | Cross-origin mutation | 403 CSRF rejection | `scripts/e2e-smoke.mjs`, `lib/api-response.ts` |
| Auth/ownership | Application logout/revocation/cross-device session | Opaque D1-backed session is revoked on logout and rejected after revocation; fresh cross-device/browser evidence remains required | `lib/app-auth.ts`, `app/api/auth/logout/route.ts`, `FINAL_ACCEPTANCE.md` |
| Lifecycle | Payment/consent gates and invalid state | State machine rejects unsafe transition | `scripts/e2e-smoke.mjs`, `lib/durable-store.ts` |
| Lifecycle | Same answer idempotency key replay | 200 replay; no duplicate row | `scripts/e2e-smoke.mjs` |
| Lifecycle | Missing or malformed response idempotency key | 422; no response row is created | `app/api/assessments/[id]/responses/route.ts`, `scripts/e2e-smoke.mjs` |
| Lifecycle | Response presentation metadata | Server timestamp, sequence, phase/position, locale and version metadata are persisted and exported | `lib/durable-store.ts`, `scripts/e2e-smoke.mjs` |
| Lifecycle | Worker restart after Q001 | Server state resumes with confirmed answer | `scripts/e2e-smoke.mjs` |
| Lifecycle | Concurrent answer writes with distinct idempotency keys | One server sequence per accepted response; transient write conflicts are safely retryable | `scripts/load-smoke.mjs`, `lib/durable-store.ts` |
| PDF | Valid signed link | 200 private PDF | `scripts/e2e-smoke.mjs` |
| PDF | Missing/tampered/expired/wrong owner token | 401 | `scripts/e2e-smoke.mjs`, `tests/unit.test.ts` |
| PDF | Missing R2 object | 404 safe error; no database score mutation | `scripts/e2e-smoke.mjs` |
| PDF | Regeneration | `score_unchanged=true`; frozen score JSON remains equal | `scripts/e2e-smoke.mjs` |
| PDF | Visual rendering | Four deterministic 24-page RU fixtures rendered as A4 PNGs and inspected; no clipping/overflow/font defects | `scripts/pdf-visual-qa.mjs`, `output/pdf/`, `FINAL_ACCEPTANCE.md` |
| Teen PDF | Oversized streamed body, malformed JSON and invalid/oversized report fields | Bounded byte reader returns 413 without buffering an unbounded body; malformed/invalid payloads return 400/422 | `app/api/teen/pdf/route.ts`, `lib/teen-pdf.ts`, `tests/t-skills-teen.test.ts`, `scripts/e2e-smoke.mjs` |
| Teen scoring | Negative response selects left, positive selects right; v1-fix uses v1 statement positions with corrected scorer | Trait contributions follow the visible labels; completed v1 profiles stay frozen and are warned | `tests/t-skills-teen.test.ts`, `tests/t-skills-teen-runtime.test.ts`, `drizzle/0024_teen_scoring_direction_v2.sql` |
| Teen item-side balance | All 25 traits appear exactly 3 times left and 3 times right in v2; all 75 v1 pair identities are retained | Fixed global left/right position exposure imbalance while keeping statement text and pair membership | `lib/t-skills/teen/orientation-v2.json`, `tests/t-skills-teen-runtime.test.ts` |
| Teen browser flow | Published RU flow through onboarding, 75 pairs, clarifications and PDF download | Client flow ends at the published v2 75+8 version boundary; no unversioned career-preference stage is applied | `tests/browser/csp.spec.ts`, `app/views/teen/teen-flow-view.tsx`, `CHANGELOG.md` |
| Privacy | Allowlisted telemetry with raw-answer/email fields | Unsafe metadata discarded | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Legal production gate | Missing approval marker or operator field | Public output uses non-factual draft markers; production registration, new assessments, checkout and indexing stay disabled | `tests/legal-config.test.ts`, `scripts/e2e-smoke.mjs`, `lib/legal-config.ts`, `lib/seo-config.ts` |
| Privacy | Export owner and User B | Owner gets artifact; User B gets 404 | `scripts/e2e-smoke.mjs` |
| Privacy | Delete assessment | R2 first, then D1 response/assessment rows removed | `scripts/e2e-smoke.mjs`, `lib/durable-store.ts` |
| Privacy | Delete account | Request state, artifact deletion and audit path are implemented | `lib/durable-store.ts`, `app/api/account/delete/route.ts` |
| Privacy | Retention dry-run | Candidate report, count and failure metadata without purge | `scripts/e2e-smoke.mjs`, `lib/retention.ts` |
| Privacy | Real retention purge, crash after artifacts, resume and active exclusion | Persistent purge state machine passes isolated Wrangler E2E; staging drill remains operational | `lib/retention.ts`, `scripts/e2e-smoke.mjs` |
| Localization | `kz` request | Canonical `kk`, legacy alias, unpublished status | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Localization | `kk`/`en` start | 422 until translations and review are published | `scripts/e2e-smoke.mjs`, `app/api/assessments/route.ts` |
| Operations | Migration forward path and drift | 0000–0024 apply; generated schema has no drift; fixture verifies v1 unfinished-session bridge and completed-report freeze | `scripts/check-migration-drift.mjs`, `tests/teen-version-migration.test.ts`, `drizzle/` |
| Operations | Backup/restore | Export and restore a seeded row | `scripts/backup-restore-smoke.mjs` |
| Operations | Rate limit | 429 plus Retry-After at configured boundary | `scripts/e2e-smoke.mjs` |
| Operations | Request observability | Request ID/security headers and PII-safe structured record | `tests/unit.test.ts`, `lib/observability.ts` |
| Operations | Alert calculation | Report/adaptive/request/retention threshold events | `tests/unit.test.ts`, `lib/ops-monitoring.ts` |
| Operations | Concurrent load | p50/p95/p99, errors, throughput, 429, zero lost/duplicate responses, idempotent replay and double complete-core | `scripts/load-smoke.mjs` |
| Operations | Job retry/alert sink/on-call | Deployment and operations evidence required | `RUNBOOKS.md`, `FINAL_ACCEPTANCE.md` |

## Reproduction

From a clean checkout with Node `22.13.0`:

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run test:e2e
npm run test:browser
npm run test:pdf-visual
npm run test:load
npm run test:backup
npm run db:check
npm run test:retention-plan
npm run audit:check
npm run package:source
```

The E2E server uses only local `e2e-*` values. Never substitute production secrets or a production D1/R2 binding in these tests.
