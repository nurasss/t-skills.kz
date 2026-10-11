# T-Skills project handoff

> Historical note (2026-09-17): earlier release/deployment evidence predates first-party application authentication, legal/cookie hardening and the current T-Skills pathway. The current VPS deployment is recorded separately in `DEPLOYMENT_EVIDENCE.md`; historical Git SHA and Cloudflare Access smoke results do not represent it.

> Audit refresh (2026-10-04): the working tree contains the teen `75+8` runtime and admin/CMS/payment lifecycle changes. The item review found and corrected v1's left/right scoring inversion in v2; v1 reports are warned and unfinished attempts retain their original layout under a corrected internal bridge. The v2 image is deployed on `kz-vps`, identified by image/artifact hashes in `DEPLOYMENT_EVIDENCE.md`. Local checks pass; the worktree remains dirty and has no hosted CI attestation. Keep public paid launch blocked pending legal/operator approval, external security review and psychometric validation.

## Release status

The project contains the engineering implementation for a controlled closed pilot, but master acceptance remains evidence-driven. The exact source archive passes the clean Linux release checks; pilot/public launch remains blocked until the required external content, legal, support and operations approvals are supplied.

```text
READY_FOR_ENGINEERING_100=NO (clean-room/release verification PASS; external GitHub Actions clean Linux CI run is not yet recorded)
READY_FOR_CLOSED_PILOT=NO (content/legal/protocol/support sign-off is still required)
READY_FOR_PUBLIC_PAID_LAUNCH=NO
READY_FOR_VALIDATED_CLAIMS=NO
READY_FOR_NORMATIVE_PERCENTILES=NO
```

The current release is T-Skills v2: 60 immutable Core items plus 10–15 new generated/fallback follow-up items. The complete Russian Q001–Q300 bank is preserved only for historical v1 records and is not used by new assessments. Every score carries explicit assessment, item-bank, scoring, adaptive, report and norm version IDs. `normStatus=unvalidated` is the only production-safe norm state; UI/PDF wording is `pilot profile index` and `uncertainty range`, never percentile or population norm.

### Current v2 version contract

```text
assessmentVersion = orbita30_ru_v2
itemBankVersion = core60-v1
scoringVersion = mvp-0.5-core60
adaptiveVersion = mercury-generated-0.1
reportVersion = report-0.4
normVersion = unvalidated-v2
provider = inception-labs
model = mercury-2.5
promptVersion = mercury-adaptive-v1
```

## Release identity

- Source Git SHA: `d3ea99fd1cac90b7d76d3fcf5e790a73eaa35f13`
- Source package SHA-256: `0e7975c9f9085762e0a56550de35c165bb58956421034ab740ad1b48e3bd0efb`
- Evidence commit: `see final Git HEAD; source identity is frozen in RELEASE_MANIFEST.json`
- CI run URL/ID: `NOT AVAILABLE` — the GitHub Actions workflow is committed, but an external hosted run is not available in this task.
- Runtime: Linux clean-room verification with Node `22.13.0`; package lock SHA-256 `f846fe5a9b09c37f2859af0fe1f281687796991ba015e41e03ad34cd8d0ddf57`
- Latest migration in the current worktree: `drizzle/0024_teen_scoring_direction_v2.sql`
- Local release artifact: `/Users/nuras/Desktop/gallup/release-artifacts/orbita-30-source-release-d3ea99f.tar.gz`
- Archive rule: tracked blobs from the exact source SHA; generated release evidence and this handoff are delivered alongside the archive.

## Deployment

The GitHub + Cloudflare track is defined in `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml` and `wrangler.jsonc`. The current source uses first-party application authentication with isolated staging/production bindings, a non-payment `beta_free` entitlement, an explicit `ENTITLED` assessment state and payments/AI kill switches. The previous Cloudflare Access/dispatch-identity deployment is historical and must be redeployed before it can represent this source.

- Production URL: `https://orbita-30.yzh905284.chatgpt.site`
- Closed-beta staging Worker: `https://orbita-30-staging.bulatulynurasyl22.workers.dev`
- Closed-beta production Worker: `https://orbita-30-production.bulatulynurasyl22.workers.dev`
- Hosting project: `.openai/hosting.json` (`appgprj_6aa859a4ac588191b9560deef28958a9`)
- Source is versioned in Git and published through the Sites `sites` remote.
- On 2026-10-04, `t-skills.kz` was updated through `kz-vps` to Teen v2 image `a2f14aafdb22…`; migration 0024 is present, and public health/catalog/robots checks confirm the legal gate is closed. One unfinished v1 assessment was migrated to the corrected bridge without changing item layout or answers. Completed v1 reports remain unchanged and are flagged. The deployment came from a dirty worktree, so it is identified by image and runtime artifact hashes rather than a clean Git SHA. Cloudflare staging/production Workers still return Access redirects and have not been redeployed. Protected APIs require a verified first-party session; preview identity is accepted only in a fully local environment.
- D1 binding is `DB`; R2 binding is `BUCKET`. The custom deploy Worker is `worker/index.ts`; its built `dist/server/index.js` exports both HTTP `fetch` and scheduled retention `scheduled`.
- Worker requests strip legacy Cloudflare Access/ChatGPT identity headers before application code sees them. Edge access controls, if retained for operations, are an additional boundary and are not the application authentication mechanism.
- Cron: `0 2 * * *`. Retention defaults to dry-run until explicitly disabled.

Before any publish, run the Sites build/package/save/deploy workflow and verify the exact full Git SHA. The immutable source archive is source-only and intentionally excludes generated `dist/`; the separate Sites deployment build must contain `dist/server/index.js`, `dist/.openai/hosting.json` and `dist/.openai/drizzle/**`, while excluding dependencies, generated local state and OS artifacts.

## What is implemented

1. Scoring and norms

   - Deterministic server scoring preserves reverse/Likert/forced-choice directions.
   - `ScoringProvider` and `NormProvider` boundaries are explicit.
   - Unvalidated norm provider emits bounded pilot indices and uncertainty ranges without normative claims.
   - Persisted legacy score snapshots are normalized at read boundaries; old `percentile`/`ci95` fields are not displayed or re-emitted.

2. v2 Core60 and adaptive provider

   - Core60 is a separate immutable bank: 30 primary Likert items plus 30 discrimination forced-choice items, covering 30 traits and 6 domains.
   - Preliminary and final v2 scores are deterministic and server-side; adaptive refinements are bounded and versioned.
   - `MercuryAdaptiveProvider` receives only minimized `AdaptiveContext`, requests 10–15 new structured questions, and cannot provide score weights, percentiles or Top 5.
   - Server validation enforces traits, reason allowlist, format/options, semantic uniqueness, safety, PII/medical/political/religious/sexual exclusions and max three generated exposures per trait.
   - Reason codes are an exact allowlist: `HIGH_UNCERTAINTY`, `TOP5_BOUNDARY`, `TOP10_BOUNDARY`, `CONTRADICTION`, `UNDERCOVERAGE`, `PAIR_DISCRIMINATION`, `HIGH_INFORMATION`.
   - Inception Labs errors, timeout, rate limit, missing secret and invalid output retry at most twice and then use the 24-item approved deterministic fallback bank.
   - Generated questions are immutable assessment snapshots; response sources are `core`, `adaptive_ai` or `adaptive_fallback` and are included in export.

3. Quality

   - Straight-line detection uses modal frequency rather than the first answer.
   - Too-fast behavior is exploratory/pilot-only and does not silently invalidate a score.
   - Q243/Q246/Q249/Q250 are explicit research-only consistency markers and do not enter trait scores.
   - RQI and quality flags are persisted as pilot metrics.

4. Reports and PDF

   - `lib/interpretation-library.ts` is a versioned approved source for trait contribution, manifestations, best conditions, exact overuse risk, development actions and the supported pair set.
   - AI receives only minimized score/profile context and approved semantics. Schema and post-validation prevent unsupported traits/pairs and canonicalize approved meanings.
   - PDF is generated from structured JSON and frozen score data. It contains the required profile, domains, top strengths, combinations, teamwork, communication, thinking/execution/influence, self-management, stress/blind spots, development plan, methodology and limitations sections.
   - Current output is a 24-page A4 report and contains no normative percentile claim.

5. Response persistence

   - Every response submit requires a bounded `Idempotency-Key`; replay returns the original server sequence without creating a duplicate.
   - The server records the timestamp, client sequence and non-PII presentation metadata (phase, position, block, locale and frozen item/translation versions), and includes it in the owner export.

6. Payments

   - Checkout is hosted by Stripe; the backend does not collect card data.
   - Price and currency are read from the backend catalog before redirect and copied into the order.
   - Webhooks require Stripe signature verification, exact checkout session/order metadata/test ID/amount/currency/payment status matching, replay hash/idempotency protection and a paid-order non-downgrade rule.
   - Order uniqueness is `(user_id, idempotency_key)` with migration `drizzle/0006_common_rick_jones.sql`.
   - Entitlement is created only after the durable verification transaction succeeds.

7. Retention, privacy and analytics

   - The scheduled and internal retention paths exclude active sessions, delete R2 artifacts before D1 rows, retain transaction records, record pseudonymous purge audit entries and support bounded idempotent dry-runs.
   - Full versioned Privacy and Terms documents are rendered from env-driven operator/legal configuration. Kazakhstan legal review and replacement of every placeholder are launch gates.
   - Analytics is allowlisted and strips raw answers, response payloads and identity fields. Admin analytics returns aggregate funnel/provider/fallback/latency/report/PDF/quality data and hides psychometrics until the minimum pilot sample (200) exists.
- Russian is published. `kk` is the canonical Kazakh code and `kz` is legacy input only. KZ/EN remain unpublished until translation, back-translation, cognitive review and measurement-invariance review.

## Frontend responsibility boundaries

- `app/orbita-app.tsx` is a thin shell for global layout and error presentation.
- `app/orbita-view-router.tsx` maps the current view state to presentational components without network calls or scoring/payment rules.
- `hooks/use-orbita-controller.ts` owns client flow orchestration, network state, report/account actions and WebMCP registration; it returns a typed controller contract and no JSX.
- `app/orbita-views.tsx` remains presentation-only. `app/orbita-api.ts` handles API/retry persistence, while `hooks/use-assessment-queue.ts`, `lib/response-retry-queue.ts` and `lib/view-routing.ts` remain testable without a DOM.

## Production values still required

These values cannot be inferred or fabricated:

1. `ASSESSMENT_PRICE_MINOR` — business-approved price in minor units.
2. Managed secret `STRIPE_SECRET_KEY`.
3. Managed secret `STRIPE_WEBHOOK_SECRET`.
4. Resend sender configuration and operator/legal values in `.env.example` for entity, support, jurisdiction, purposes, data categories, retention, processors, cross-border processing, rights, security, research, marketing, refunds and cookies.

`PDF_SIGNING_SECRET` is a dedicated required managed secret for protected PDF links; the implementation has no fallback to the internal token, and its production presence must be verified by the operator. The default `approved-library` report/adaptive providers are safe without OpenAI. If enabled, `OPENAI_API_KEY` must be a managed secret; missing/error/timeout/schema failure falls back to approved deterministic behavior.

Until the three payment values are configured, `/api/catalog` reports checkout unavailable and the UI cannot redirect to a checkout with an unknown price. Until email/legal values are configured and approved, the app must remain a controlled pilot. Do not publish percentile, norm, clinical, IQ, employment-selection or other high-stakes claims.

## Verification commands

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run test:coverage
npm run test:e2e
npm run test:browser
npm run test:pdf-visual
npm run build
npm run test:retention-plan
npm run test:backup
npm run test:load
npm run security:scan
npm run check:gates
npm run package:source
npm run release:verify
npm run audit:check
```

The smoke test runs a real local Worker with D1/R2 bindings and exercises the catalog, auth, beta entitlement, versioned consent, all 60 Core items, preliminary scoring, adaptive snapshot/fallback completion, required idempotency keys, server-derived response metadata/export, restart/resume, frozen score, approved report, signed PDF negative paths, ownership, rate limiting, payment races/refund/dispute states and privacy deletion/export paths. Historical v1 fixtures remain covered separately where they explicitly use Q001–Q250.

## Known non-code gates

- Independent expert/content review and similarity/trademark review.
- Cognitive interviews and pilot administration.
- Reliability/SE, EFA/CFA, validity, DIF, measurement invariance and preregistered pilot analysis.
- Norm construction and cross-validation; no norm table is installed.
- Kazakhstan privacy/consumer/payment/legal review and approved retention/processor/cross-border wording.
- Real Stripe business account, amount, webhook endpoint, refund policy and operational support channel.
- KZ/EN translations with back-translation and cognitive/invariance checks.
- External GitHub Actions Ubuntu clean Linux CI run and hosted run URL/ID.
