# ORBITA-30 Risk-Critical Test Matrix

The matrix is intentionally scenario-based. Line coverage is not used as the release criterion. The local E2E suite uses an isolated Wrangler D1/R2 state directory and only local test secrets.

| Area | Scenario | Expected result | Evidence |
|---|---|---|---|
| Frontend architecture | Render a view with injected props | Presentation layer has no network/scoring/payment side effects | `app/orbita-view-router.tsx`, `app/orbita-views.tsx`, `npm run lint`, `npx tsc --noEmit` |
| Frontend architecture | Execute assessment flow actions through the controller | Flow/network/WebMCP orchestration is isolated from the shell and view components | `hooks/use-orbita-controller.ts`, `app/orbita-app.tsx` |
| Frontend architecture | Persist/retry a response | Queue remains deterministic and DOM-free | `hooks/use-assessment-queue.ts`, `lib/response-retry-queue.ts`, `tests/retry-queue.test.ts` |
| Scoring | Same response map scored twice | Byte-equivalent deterministic profile | `tests/unit.test.ts` — deterministic scoring |
| Scoring | Reverse Likert and forced-choice direction | Direction is preserved | `tests/unit.test.ts` |
| Scoring | Legacy percentile/CI snapshot | Normalized to profile index/uncertainty range; no percentile | `tests/unit.test.ts` |
| Quality | Modal straight-line, too-fast, research-only markers | Flags are explicit and do not silently alter score | `tests/unit.test.ts` |
| Core60 | Exactly 60 fixed items, 30 traits, 6 domains, 30/30 formats | Unique/versioned IDs, complete coverage and deterministic mapping | `lib/v2-item-bank.ts`, `tests/v2-core60.test.ts` |
| v2 scoring | Same Core60 + frozen adaptive answers and versions | Byte-equivalent deterministic preliminary/final profile; bounded refinement only | `lib/orbita-v2-engine.ts`, `tests/v2-core60.test.ts` |
| Adaptive | Mercury generates 10–15 new items | Server count/trait/reason/format/safety/duplicate validation; no score weights | `lib/mercury-adaptive-provider.ts`, `tests/mercury-adaptive.test.ts` |
| Adaptive fallback | Missing secret, timeout, 429, 5xx, malformed/invalid output | At most two provider attempts, then deterministic approved fallback | `lib/mercury-adaptive-provider.ts`, `tests/mercury-adaptive.test.ts` |
| Adaptive persistence | Reload during generation or after AI-04 | Immutable item snapshots, response source and generation lock prevent duplicate generation | `lib/durable-store.ts`, `db/schema.ts`, `scripts/e2e-smoke.mjs` |
| Report safety | Prompt injection, unsupported source key, forbidden score/percentile/clinical language | Validator rejects; approved library remains authority | `tests/unit.test.ts`, `lib/report-safety.ts` |
| Report safety | Numeric/top-strength mutation | Canonical profile values and source keys are required | `lib/report-provider.ts`, `lib/report-safety.ts` |
| Payment | Valid signed checkout completion | Exact snapshot match before entitlement | `scripts/e2e-smoke.mjs`, `lib/payment-integrity.ts` |
| Payment | Bad/expired signature | Safe reject; no entitlement | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Payment | Wrong amount/currency/session/test | 409/safe reject; no grant | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Payment | Replay and concurrent duplicate events | One accepted grant, duplicate is idempotent | `scripts/e2e-smoke.mjs` |
| Payment | Late failure after paid, refund, dispute, dispute close | Monotonic operational status and audit/telemetry event | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Auth/ownership | Anonymous account request | 401 | `scripts/e2e-smoke.mjs` |
| Auth/ownership | User B guesses A assessment/report/export ID | 404 and no payload disclosure | `scripts/e2e-smoke.mjs` |
| Auth/ownership | User B reuses A signed PDF token | 401 | `scripts/e2e-smoke.mjs` |
| Auth/ownership | Cross-origin mutation | 403 CSRF rejection | `scripts/e2e-smoke.mjs`, `lib/api-response.ts` |
| Auth/ownership | Public logout/revocation/cross-device session | External gate; not claimed by private Sites identity | `FINAL_ACCEPTANCE.md` |
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
| Privacy | Allowlisted telemetry with raw-answer/email fields | Unsafe metadata discarded | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Privacy | Export owner and User B | Owner gets artifact; User B gets 404 | `scripts/e2e-smoke.mjs` |
| Privacy | Delete assessment | R2 first, then D1 response/assessment rows removed | `scripts/e2e-smoke.mjs`, `lib/durable-store.ts` |
| Privacy | Delete account | Request state, artifact deletion and audit path are implemented | `lib/durable-store.ts`, `app/api/account/delete/route.ts` |
| Privacy | Retention dry-run | Candidate report, count and failure metadata without purge | `scripts/e2e-smoke.mjs`, `lib/retention.ts` |
| Privacy | Real retention purge, crash after artifacts, resume and active exclusion | Persistent purge state machine passes isolated Wrangler E2E; staging drill remains operational | `lib/retention.ts`, `scripts/e2e-smoke.mjs` |
| Localization | `kz` request | Canonical `kk`, legacy alias, unpublished status | `tests/unit.test.ts`, `scripts/e2e-smoke.mjs` |
| Localization | `kk`/`en` start | 422 until translations and review are published | `scripts/e2e-smoke.mjs`, `app/api/assessments/route.ts` |
| Operations | Migration forward path and drift | 0000–0010 apply; generated schema has no drift | `scripts/check-migration-drift.mjs`, `drizzle/` |
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
npm audit --omit=dev --audit-level=high
npm run package:source
```

The E2E server uses only local `e2e-*` values. Never substitute production secrets or a production D1/R2 binding in these tests.
