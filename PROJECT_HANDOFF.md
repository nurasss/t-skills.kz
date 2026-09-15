# ORBITA—30 handoff

## Technical release

- Production URL: `https://orbita-30.yzh905284.chatgpt.site`
- Hosting project: read from `.openai/hosting.json`
- Source is versioned in Git and published through Sites.
- The site is owner-private; unauthenticated visitors receive `401` on protected pages and APIs.
- D1 and R2 are durable production bindings. Reports are private objects and are delivered through five-minute HMAC-signed links.
- The current default providers are deterministic `approved-library` implementations. No fake AI call is reported when an AI key is absent.

## Implemented against the TЗ

- 300-item Russian draft-for-pilot bank: 150 forced-choice, 90 Likert, 10 quality, 50 adaptive.
- Server-side scoring with version IDs, confidence intervals, quality flags, deterministic report input, and frozen score JSON.
- Backend-validated adaptive selection: 10–15 items, default 12, max three items per trait, no answered IDs, no semantic-cluster duplicates, OpenAI timeout/error fallback.
- Persistent assessment state, response time, client sequence and idempotency handling.
- Hosted Stripe Checkout abstraction and signed idempotent webhook path. Card data never enters the application backend.
- Four independent versioned consent decisions: Terms, Privacy/processing, research opt-in and marketing opt-in. Terms and Privacy are required; research and marketing are optional.
- Export and deletion workflow, including R2 artifacts, responses, reports, adaptive runs, consents, telemetry and rate-limit records.
- Strict report validation, safe approved-library narrative, optional privacy-minimized OpenAI Responses API provider, and 24-page A4 PDF.
- Same-origin mutation protection, no permissive CORS, per-user fixed-window limits, owner-scoped access checks, audit events and telemetry allowlisting.
- Local QA: full assessment flow, signed/tampered PDF links, replayed completion, export, deletion and 100 concurrent session creation plus 100 autosaves.
- Production-runtime dependency audit: `npm audit --omit=dev --audit-level=high` reports 0 vulnerabilities after the Next/lockfile update.

## Values that must be supplied before accepting real payments

These values cannot be invented from the TЗ:

1. `ASSESSMENT_PRICE_MINOR` — the business-approved price in minor units. The `1,500 KZT` value in the README is only an example.
2. Secret `STRIPE_SECRET_KEY` — the production Stripe account key.
3. Secret `STRIPE_WEBHOOK_SECRET` — the signing secret for `/api/payments/webhook`.

`PDF_SIGNING_SECRET` is already configured as a managed secret in production. The default approved-library report and deterministic adaptive selector are intentionally active until an optional `OPENAI_API_KEY` and approved model choice are supplied.

## Pre-launch decisions outside code

The source TЗ itself marks the item bank as draft for pilot. A real public launch still requires independent expert review, cognitive interviews, pilot data, reliability/validity/fairness analysis, norms, translation/back-translation for KZ/EN, Kazakhstan privacy/legal review, and trademark/similarity review. The current admin surface is an aggregate read-only quality panel; full psychometric CRUD/dashboard workflows require those approved content, parameter and pilot-data inputs.

Do not describe the current scores as clinically valid, diagnostic, employment selection, IQ or scientifically normed results.
