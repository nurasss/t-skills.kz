# Changelog

## 2026-09-17 — Product renamed to T-Skills

- Public product brand is now **T-Skills** (tagline «Профиль ваших сильных сторон»); the user-facing assessment is called **Тест T-Skills**. All UI, PDF, email, legal, SEO and metadata strings were switched from ORBITA-30 to T-Skills.
- Canonical routes are now `/tests/t-skills` and `/checkout/t-skills`; legacy `/tests/orbita30` and `/checkout/orbita30` return a permanent redirect to the new URLs and keep resolving in the client shell.
- New PDF/export downloads are named `t-skills-*.pdf` / `t-skills-data-*.json`. Existing R2 objects keep their keys and stored metadata.
- Internal compatibility identifiers are unchanged: assessment/item-bank/scoring/adaptive/report/norm version IDs (`orbita30_ru_v2`, `core60-v1`, …), API `test_id="orbita30"`, env vars (`ORBITA_ENV`, `ORBITA_INTERNAL_TOKEN`, …), cookies/storage keys, worker/D1/R2 names and the release-manifest schema. Historical evidence documents were not rewritten.

## 2026-09-16 — ORBITA-30 v2 Core60 + Mercury adaptive migration

- Added immutable `orbita30_ru_v2` Core60 (`core60-v1`): 30 primary Likert items plus 30 discrimination forced-choice items covering all 30 traits and 6 domains; legacy Q001–Q300 remains available for v1 snapshots.
- Added deterministic v2 scoring (`mvp-0.5-core60`) with bounded adaptive refinement, explicit uncertainty/boundary/contradiction context and `normStatus=unvalidated`.
- Added `MercuryAdaptiveProvider` for Inception Labs `mercury-2.5`, versioned Russian prompt, strict JSON schema, safety/semantic validation, two-attempt retry policy and a 24-item approved deterministic fallback bank.
- Added immutable generated-question snapshots, response-source metadata, adaptive-generation lock/attempt state, resume-safe state transitions and aggregate Mercury analytics.
- Updated report/PDF/UI/API/export/smoke/load/docs and kept production Mercury disabled until staging secret provisioning and E2E acceptance.

## 2026-09-16 — Release hardening follow-up

- Made assessment creation safe under concurrent clicks, returned the actual next unanswered item, and serialized concurrent response writes with an optimistic server sequence.
- Made export/account-deletion privacy jobs durable across D1 failures and served completed export artifacts with `no-store` caching.
- Forced the current unvalidated norm provider at score-snapshot read boundaries so legacy or malformed persisted data cannot promote itself to `normed`.
- Required a bounded `Idempotency-Key` for every response submit and persisted server-derived presentation metadata with the response/export record.
- Removed the PDF signing fallback to `ORBITA_INTERNAL_TOKEN`; PDF links now require the dedicated `PDF_SIGNING_SECRET`.
- Recorded clean-room release evidence separately from the handoff and corrected the security review to match the nonce-based CSP.

## 2026-09-15 — ORBITA-30 MASTER remediation release

- Preserved the existing `Q001`–`Q300` item bank, scoring architecture and private Sites deployment model.
- Added canonical locale handling: `kk` is canonical, `kz` is a legacy alias, and unpublished locales are blocked from assessment start.
- Added assessment locale/translation snapshot and migration `0007_tough_gorgon.sql`.
- Added strict adaptive/report provider contracts, source-key grounding, forbidden-claim rejection and deterministic fallback telemetry.
- Added request IDs, security headers, PII-safe structured logs, monotonic payment operational states and operational alert helpers.
- Added assessment deletion, ownership checks, signed-PDF expiry/tamper/owner boundaries and expanded export/deletion coverage.
- Added clean-source security scan, D1 backup/restore smoke and Ubuntu/Node 22.13 CI workflow.
- Added the ORBITA-30 MASTER evidence pack and explicit external-gate statuses. No legal, Stripe-live, psychometric or normative approval is fabricated.

The frozen item bank and public scoring version are unchanged. Any future item, scoring, translation, norm or report-template change requires a new immutable version and migration/release record.
