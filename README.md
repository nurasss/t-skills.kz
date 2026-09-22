# T-Skills

Production-oriented T-Skills assessment: a 67-item pairwise core with deterministic 25-trait scoring, up to 8 server-validated career clarification questions, protected identity, durable Cloudflare D1 state, private R2 report artifacts, short-lived signed PDF links, Pricing Registry-backed Checkout/webhooks, exports/deletion workflows, privacy-safe telemetry, scheduled retention, and a private closed-beta deployment. The historical Core60/Mercury and Q001–Q300 pathways remain versioned compatibility contracts and are not allowed to rewrite T-Skills scoring.

The Master Specification v5 pathway is prepared behind an independent, versioned contract in [`lib/t-skills/v5/`](./lib/t-skills/v5/) and is documented in [`docs/T_SKILLS_V5_IMPLEMENTATION.md`](./docs/T_SKILLS_V5_IMPLEMENTATION.md). It is intentionally content-gated: the client-approved 75-item bank, 25-trait taxonomy, clarification bank, profession catalog, career tie-breaks and roadmap templates must pass `npm run content:t-skills:v5:check` before v5 can replace the active `t-skills_pairwise_v1` flow. No production questions, trait definitions or career weights are invented in the repository.

The assessment is an original developmental product. It is not a Gallup/CliftonStrengths® implementation, a diagnosis, or a high-stakes decision tool. Items are marked `draft for pilot` until independent psychometric validation is completed.

## Closed beta deployment

The beta profile is intentionally free and closed: `PAYMENTS_ENABLED=false`, `ENTITLEMENT_MODE=beta-free`, and the approved interpretation library. Production beta remains `AI_ENABLED=false` by policy; staging is configured for `AI_ENABLED=true`, `ADAPTIVE_PROVIDER=mercury`, and a managed `INCEPTION_API_KEY`, with deterministic approved fallback on provider failure. Staging and production use separate Workers, D1 databases, R2 buckets and application-auth secrets. See `wrangler.jsonc`, `docs/deployment/` and `BETA_TESTER_GUIDE.md`.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Release gates

This repository is an engineering-complete candidate for a controlled pilot, but the final master gates remain evidence-driven. It is not a public paid launch and it does not make validated normative claims:

```text
READY_FOR_ENGINEERING_100=NO (clean-room Linux release evidence passes; external GitHub Actions clean Linux CI run is still required)
READY_FOR_CLOSED_PILOT=NO (content, legal, recruitment, support and protocol sign-off still required)
READY_FOR_PUBLIC_PAID_LAUNCH=NO (production price and Stripe secrets are not invented)
READY_FOR_VALIDATED_CLAIMS=NO (pilot data, norms, reliability, validity, DIF/invariance are pending)
READY_FOR_NORMATIVE_PERCENTILES=NO (no approved norms are installed)
```

The score contract exposes `normStatus=unvalidated`, calls the visible number a `pilot profile index`, and labels the interval an `uncertainty range`. No percentile or population-comparison claim is shown. The assessment and item-bank version IDs are frozen in `lib/assessment-engine.ts`; changing them requires a new version and migration/release note.

## Sites Lifecycle

The Sites initializer copies the shared starter with the explicit `--execution-profile portable` or `--execution-profile managed-linux` argument from the plugin's setup instructions. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Whenever reopening or moving a checkout, follow the plugin's instructions to run `configure-execution-profile.mjs --execution-profile <portable|managed-linux>` before project commands. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

The current closed-beta deployment uses `wrangler.jsonc` named `staging` and `production` environments. Secrets are managed outside Git with Wrangler/Cloudflare; only secret names and safe defaults belong in tracked configuration.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

On managed Linux, use `sites-preview start` only for requested browser QA. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile supports a preview-only identity header for local smoke tests. It is accepted only when `ORBITA_ENV=development`; production accepts only a verified D1-backed application session. No ChatGPT or Cloudflare Access identity header is used by the application.

The Worker entrypoint is `worker/index.ts`. It delegates HTTP requests to `vinext/server/fetch-handler` and also exports the scheduled retention handler. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Vercel Preview is configured as a separate Nitro target for visual and runtime compatibility checks: `npm run build:vercel`, then `vercel deploy --prebuilt`. The Vercel target intentionally does not emulate Cloudflare D1/R2 or the D1-backed application auth; public pages plus storage-independent endpoints can be smoke-tested there, while assessment, account, report, PDF and retention flows remain on the canonical Cloudflare Worker. Never copy Cloudflare, Resend or Inception secrets into the Vercel build unless a separate Vercel storage/auth architecture is approved.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Project shape

- `app/orbita-app.tsx` — thin client shell: header/footer, global error and view composition.
- `app/orbita-view-router.tsx` — presentation routing for landing, catalog, checkout, consent, assessment, break, results, account, methodology and legal/support views.
- `hooks/use-orbita-controller.ts` — assessment-flow orchestration, network state, WebMCP registration and account/checkout/report actions; it owns no JSX.
- `app/orbita-views.tsx` — presentation-only views; `app/orbita-api.ts`, `hooks/use-assessment-queue.ts`, `lib/view-routing.ts` and `lib/response-retry-queue.ts` are API/queue/routing boundaries, with the queue and routing logic remaining DOM-free.
- `lib/t-skills/` — active pairwise item bank, deterministic trait scoring, career clarification, matching and report contracts.
- `lib/v2-item-bank.ts`, `lib/orbita-v2-engine.ts`, `lib/mercury-adaptive-provider.ts` and `lib/prompts/mercury-adaptive-v1.ts` — preserved versioned compatibility pathways; they cannot score or mutate the active T-Skills contract.
- `lib/assessment-engine.ts` and `lib/item-bank.ts` — shared report/scoring contracts plus the preserved legacy 300-item bank for v1 snapshots.
- `lib/interpretation-library.ts` — versioned approved trait/pair semantics; AI output cannot add unsupported claims.
- `lib/durable-store.ts` — all user-owned state transitions and ownership checks.
- `lib/payment-provider.ts` and `lib/payment-integrity.ts` — signed Stripe Checkout creation and exact, idempotent webhook verification.
- `lib/report-provider.ts` — deterministic approved-library reports by default, with an optional strict OpenAI Responses API provider and fallback.
- `lib/pdf-generator.ts` — 24-page A4 PDF report generation with embedded Roboto TTF.
- `lib/retention.ts` and `worker/index.ts` — idempotent R2/D1 retention sweep, dry-run mode, manual internal endpoint, and daily cron.
- `docs/adr/ADR-001-runtime-and-cloudflare.md` — accepted pilot runtime decision and Vinext migration triggers.
- `scripts/load-smoke.mjs`, `scripts/pdf-visual-qa.mjs`, `scripts/verify-release.mjs` — load, visual PDF, and exact-Git release gates.
- `lib/security-headers.ts`, `lib/observability.ts` and `lib/ops-monitoring.ts` — request IDs, security headers, PII-safe logs and explicit alert thresholds.
- `lib/app-auth.ts`, `lib/password.ts`, `lib/email.ts` and `lib/auth-rate-limit.ts` — D1-backed password auth, one-time e-mail tokens, server-only transactional mail and hashed rate-limit identities.
- `lib/provider-contract.ts`, `lib/adaptive-contract.ts`, `lib/report-safety.ts` and `lib/mercury-adaptive-provider.ts` — strict provider output, source-key grounding and deterministic safety boundaries.
- `lib/pilot-analytics.ts` and `app/api/admin/overview/route.ts` — aggregate-only pilot analytics with a minimum-sample guard.
- `app/orbita-api.ts` and `app/orbita-view-types.ts` — client API/retry persistence and shared view contracts.
- `db/schema.ts` and `drizzle/` — D1 schema and append-only migrations.
- `FINAL_ACCEPTANCE.md`, `TEST_MATRIX.md`, `RELEASE_MANIFEST.json`, `CI_EVIDENCE.txt`, `SECURITY_REVIEW.md`, `DATA_PRIVACY_REVIEW.md`, `LEGAL_LAUNCH_APPROVAL.md`, `PILOT_PROTOCOL.md`, `PREREGISTRATION.md`, `PSYCHOMETRIC_REPORT.md`, `NORMING_REPORT.md` and `RUNBOOKS.md` — release evidence and explicit open gates.
- `.openai/hosting.json` — logical Sites bindings (`DB` and `BUCKET`) and the existing private project ID.

The production site is closed beta. User identity comes from a verified D1-backed application session; local preview-only auth is available only when `ORBITA_ENV=development`. State-changing API routes enforce same-origin requests, CSRF validation and server-side fixed-window limits; no permissive CORS policy is enabled. TLS, WAF/CDN policy and edge security headers remain deployment controls of the Sites platform.

## Production configuration

Set non-secret runtime values in the matching Cloudflare Worker environment; never store secrets in `wrangler.jsonc`, `.openai/hosting.json` or source control. Non-secret baseline:

```text
ORBITA_ENV=production
PAYMENT_PROVIDER=stripe
ASSESSMENT_CURRENCY=KZT
APP_BASE_URL=https://orbita-30.yzh905284.chatgpt.site
REPORT_PROVIDER=approved-library
AI_ENABLED=false                 # production beta; staging is true
ADAPTIVE_PROVIDER=deterministic  # production beta; staging is mercury
MERCURY_MODEL=mercury-2.5
MERCURY_TIMEOUT_MS=12000
MERCURY_MAX_RETRIES=2
RETENTION_DAYS=365
```

Staging overrides are explicit:

```text
AI_ENABLED=true
ADAPTIVE_PROVIDER=mercury
INCEPTION_API_KEY=<managed secret, never committed>
MERCURY_MODEL=mercury-2.5
MERCURY_TIMEOUT_MS=12000
MERCURY_MAX_RETRIES=2
```

Set the staging secret only after the Worker exists, for example with `npx wrangler secret put INCEPTION_API_KEY --env staging --config wrangler.jsonc`. Production keeps its own separate secret binding and remains Mercury-off until an explicit production approval is recorded; current staging acceptance is recorded in `DEPLOYMENT_EVIDENCE.md`.

Required before accepting real payments:

- `ASSESSMENT_PRICE_MINOR` — exact price in minor units; for example, 1,500 KZT is `150000`.
- secret `STRIPE_SECRET_KEY`.
- secret `STRIPE_WEBHOOK_SECRET` for the endpoint `/api/payments/webhook`.
- secret `PDF_SIGNING_SECRET` for five-minute signed PDF download links.

Before an assessment can start, the server records four independent, versioned decisions in D1: Terms, Privacy/processing, research opt-in, and marketing opt-in. Terms and Privacy are required; the latter two are optional and are never inferred from purchase.

Optional AI narrative provider (managed secret only; approved-library fallback is always available):

- `REPORT_PROVIDER=openai` and secret `OPENAI_API_KEY`.
- Optional `REPORT_MODEL` (defaults to `gpt-5`) and `OPENAI_BASE_URL`; the endpoint is restricted to the official HTTPS `api.openai.com` origin (root or `/v1`) so an API key cannot be sent to an arbitrary host.
- Store `OPENAI_API_KEY` in the Sites/Cloudflare managed secret store. Never put it in `.env.example`, Git, the browser bundle, telemetry, or a report payload. A timeout, schema violation, unavailable key, or provider error records a fallback and returns the deterministic approved-library report.

Adaptive generation:

- Current v2 staging uses `ADAPTIVE_PROVIDER=mercury`, `MERCURY_MODEL=mercury-2.5` and the server-only `INCEPTION_API_KEY`.
- The provider calls the official Inception Labs OpenAI-compatible endpoint, requests strict JSON schema output, validates every item server-side, retries at most twice, and then selects 10–15 items from the approved fallback bank.
- Production beta remains `ADAPTIVE_PROVIDER=deterministic`/`AI_ENABLED=false` by policy after the staging Mercury smoke and full E2E passed. The historical v1 OpenAI selector is not used by new v2 assessments.

Scheduled retention and manual recovery:

- `RETENTION_DRY_RUN=true` is the safe default for a new deployment. Set it to `false` only after the operator has reviewed the retention policy.
- The Worker cron is `0 2 * * *` and invokes `runRetentionSweep` without accepting public input. It excludes active assessment states, deletes R2 artifacts before D1 rows, records a pseudonymous audit event, and is safe to rerun.
- `ORBITA_INTERNAL_TOKEN` protects `POST /internal/retention`; send `{ "dry_run": true, "limit": 100 }` for an explicit preview. Do not expose this token to the client.

Legal configuration is env-driven through `lib/legal-config.ts`. Replace every `ТРЕБУЕТСЯ УТВЕРЖДЕНИЕ`/`ТРЕБУЕТСЯ НАСТРОЙКА` placeholder with operator, contact, jurisdiction, purposes, categories, retention, processors, cross-border, rights, security, research and marketing decisions. The full versioned pages are `/privacy` and `/terms`; Kazakhstan legal review is a launch gate, not a code assumption. Russian is the only published locale in this release; `kk` is the canonical Kazakh code and `kz` is accepted only as a legacy alias. KZ/EN are intentionally marked unpublished until translation, back-translation, cognitive review and measurement-invariance review are complete.

The default `approved-library` provider is deterministic and safe to run without an AI key. It never pretends that an AI call happened. Set `users.role=admin` through a controlled operations procedure, or use `ORBITA_ADMIN_USER_IDS` for an explicit server-side allowlist; never expose either control to client input.

See [`.env.example`](./.env.example) for the complete variable list.

The explicit release handoff, audit evidence, missing external values and non-code launch gates are recorded in [`PROJECT_HANDOFF.md`](./PROJECT_HANDOFF.md), [`AUDIT_REMEDIATION.md`](./AUDIT_REMEDIATION.md) and [`FINAL_ACCEPTANCE.md`](./FINAL_ACCEPTANCE.md).

## Application authentication

The application uses its own D1-backed account boundary. `app/auth/` provides login, invite-gated registration, e-mail verification, password reset and logout. Protected server-rendered pages use `requireAppUser()` or `requireAppAdmin()`; API routes call the async session verifier and never accept a user ID from request JSON.

Passwords are hashed on the server with Web Crypto PBKDF2-HMAC-SHA-256 (`600,000` iterations, per-password random salt). The browser receives only an opaque HttpOnly session cookie; D1 stores a hash of the session token, expiry and revocation state. In production the cookie uses the `__Host-` prefix, `Secure`, `SameSite=Lax` and `Path=/`.

All state-changing browser requests use same-origin checks, a CSRF token and independent per-IP/account rate limits. JSON bodies are size-limited and strict-validated with Zod. One-time e-mail and invite values are placed in URL fragments and removed from the address bar after capture; legacy query links are still accepted during migration. Admin status comes from the server-side `users.role` field or an operations-managed allowlist. `x-orbita-preview-user` exists only for local development and smoke tests.

The first-party auth code does not use ChatGPT/Cloudflare Access identity headers. Those headers are stripped at the Worker boundary and are not an authentication source. One-time e-mail verification, reset and invite tokens are carried in URL fragments and are removed from browser history after capture.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with each pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; Sites applies the packaged `dist/.openai/drizzle/` migrations to production separately.

## Local QA flow

After building and applying the migrations, run the Worker with `npm start`. For local-only authenticated smoke requests, start it with `--var ORBITA_ENV:development` and send `x-orbita-preview-user`. Production-mode requests must use the e-mail/password flow and a verified D1 session; identity headers are not accepted.

The critical contract checks are:

- unauthenticated account/API requests return `401`;
- assessment creation without a paid entitlement returns `402`;
- answers are server-persisted and replaying the same `Idempotency-Key` is harmless;
- concurrent answer retries are serialized by an optimistic server sequence and return a retryable conflict without duplicating rows;
- invalid answers are rejected with `422`;
- Stripe signatures are required, events are idempotent, and a failure event cannot downgrade a paid order;
- cross-origin mutation attempts are rejected and high-frequency mutation bursts receive `429` with `Retry-After`;
- Terms/Privacy/research/marketing decisions are stored separately with the consent text version and included in export/delete workflows;
- reports freeze the score JSON, retry only the report layer, and produce a 24-page PDF;
- export is owner-scoped and deletion removes R2 artifacts before soft-deleting the identity.

The repeatable smoke gate covers the public catalog, auth boundary, beta entitlement, versioned consent, all 60 Core responses, preliminary scoring, adaptive generation/fallback, frozen adaptive snapshots, final norm-safe score, approved report, signed PDF, privacy-safe telemetry and export. Historical v1 E2E fixtures may still exercise Q001–Q250 explicitly as legacy coverage:

```sh
npm run test:e2e
```

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes
- `npm run content:t-skills:check -- ./path/to/t-skills-content.json`: validate the approved 25-trait/75-item/profession bundle before activation
- `npm run test`: run unit/contract tests
- `npm run test:e2e`: run the full local Worker/D1/R2 smoke flow
- `npm run test:load`: concurrent response/replay and completion load smoke with latency/error/rate-limit metrics
- `npm run test:backup`: local D1 export/restore smoke
- `npm run security:scan`: tracked/untracked source and reachable Git history secret/generated-state scan
- `npm run audit:check`: full npm dependency audit for runtime and development dependencies
- `npm run contrast:check`: critical text/button color-pair WCAG AA gate
- `npm run ci:verify`: lint, secret scan, full dependency audit, CSP/contrast/prompt/dead-code/dependency/bundle checks, TypeScript, tests, coverage, build, migration/retention and browser smoke
- `npm run package:source`: create a clean, reproducible source archive without generated/dependency artifacts

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
