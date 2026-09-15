# ORBITA—30

Production-ready foundation for the ORBITA—30 strengths assessment: a 300-item Russian item bank, deterministic scoring, backend-validated adaptive selection, protected ChatGPT identity, durable Cloudflare D1 state, private R2 report artifacts, short-lived signed PDF links, Stripe Checkout/webhooks, exports and deletion workflows, telemetry, and a private Sites deployment.

The assessment is an original developmental product. It is not a Gallup/CliftonStrengths® implementation, a diagnosis, or a high-stakes decision tool. Items are marked `draft for pilot` until independent psychometric validation is completed.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter with the explicit `--execution-profile portable` or `--execution-profile managed-linux` argument from the plugin's setup instructions. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Whenever reopening or moving a checkout, follow the plugin's instructions to run `configure-execution-profile.mjs --execution-profile <portable|managed-linux>` before project commands. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

On managed Linux, use `sites-preview start` only for requested browser QA. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Project shape

- `app/orbita-app.tsx` — client assessment flow, account, checkout, reports and WebMCP tools.
- `lib/assessment-engine.ts` and `lib/item-bank.ts` — scoring, quality flags, report inputs and the 300-item bank.
- `lib/durable-store.ts` — all user-owned state transitions and ownership checks.
- `lib/payment-provider.ts` — Stripe Checkout creation and signed, idempotent webhook handling.
- `lib/report-provider.ts` — deterministic approved-library reports by default, with an optional strict OpenAI Responses API provider.
- `lib/pdf-generator.ts` — 24-page A4 PDF report generation with embedded Roboto TTF.
- `db/schema.ts` and `drizzle/` — D1 schema and append-only migrations.
- `.openai/hosting.json` — logical Sites bindings (`DB` and `BUCKET`) and the existing private project ID.

The production site is owner-private. User identity comes from the Sites/ChatGPT headers; local preview-only auth is available only when `ORBITA_ENV=development`. State-changing API routes enforce same-origin requests and per-user server-side fixed-window limits; no permissive CORS policy is enabled. TLS, WAF/CDN policy, and edge security headers remain deployment controls of the Sites platform.

## Production configuration

Set runtime values in Sites, never in `.openai/hosting.json` or source control. Non-secret baseline:

```text
ORBITA_ENV=production
PAYMENT_PROVIDER=stripe
ASSESSMENT_CURRENCY=KZT
APP_BASE_URL=https://orbita-30.yzh905284.chatgpt.site
REPORT_PROVIDER=approved-library
ADAPTIVE_PROVIDER=approved-library
RETENTION_DAYS=365
```

Required before accepting real payments:

- `ASSESSMENT_PRICE_MINOR` — exact price in minor units; for example, 1,500 KZT is `150000`.
- secret `STRIPE_SECRET_KEY`.
- secret `STRIPE_WEBHOOK_SECRET` for the endpoint `/api/payments/webhook`.
- secret `PDF_SIGNING_SECRET` for five-minute signed PDF download links.

Before an assessment can start, the server records four independent, versioned decisions in D1: Terms, Privacy/processing, research opt-in, and marketing opt-in. Terms and Privacy are required; the latter two are optional and are never inferred from purchase.

Optional AI narrative provider:

- `REPORT_PROVIDER=openai` and secret `OPENAI_API_KEY`.
- Optional `REPORT_MODEL` (defaults to `gpt-5`) and `OPENAI_BASE_URL`.

Optional AI adaptive selector:

- `ADAPTIVE_PROVIDER=openai` and the same secret `OPENAI_API_KEY`.
- Optional `ADAPTIVE_MODEL` and `ADAPTIVE_TIMEOUT_MS`; invalid, unavailable, or timed-out selection is recorded and falls back to the deterministic selector.

The default `approved-library` provider is deterministic and safe to run without an AI key. It never pretends that an AI call happened. Set `ORBITA_ADMIN_USER_IDS` only for the ChatGPT user IDs that should access aggregate admin metrics.

See [`.env.example`](./.env.example) for the complete variable list.

The explicit release handoff, missing external values and non-code launch gates are recorded in [`PROJECT_HANDOFF.md`](./PROJECT_HANDOFF.md).

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Local QA flow

After building and applying the migrations, run the Worker with `npm start`. For local-only authenticated requests, start it with `--var ORBITA_ENV:development` and send `x-orbita-preview-user`. Production-mode requests must provide both `oai-authenticated-user-id` and `oai-authenticated-user-email`.

The critical contract checks are:

- unauthenticated account/API requests return `401`;
- assessment creation without a paid entitlement returns `402`;
- answers are server-persisted and replaying the same `Idempotency-Key` is harmless;
- invalid answers are rejected with `422`;
- Stripe signatures are required, events are idempotent, and a failure event cannot downgrade a paid order;
- cross-origin mutation attempts are rejected and high-frequency mutation bursts receive `429` with `Retry-After`;
- Terms/Privacy/research/marketing decisions are stored separately with the consent text version and included in export/delete workflows;
- reports freeze the score JSON, retry only the report layer, and produce a 24-page PDF;
- export is owner-scoped and deletion removes R2 artifacts before soft-deleting the identity.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
