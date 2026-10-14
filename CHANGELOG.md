# Changelog

## 2026-10-04 — Teen scoring correction and balanced pair layout (`t-skills-teen-v2`)

- Fixed the critical left/right sign inversion: the assessment UI sends a negative value for a left choice, while the v1 scorer added that value to the left trait. The v2 scorer now matches the UI contract.
- Balanced the pair display so every trait appears three times on each side. The 75 pairings and statement wording are unchanged; the layout has a new item-bank version.
- Added a session-only `t-skills-teen-v1-fix` bridge: unfinished v1 sessions keep the original statement layout and stored answers but use the corrected scorer. Completed v1 reports are not silently rewritten and now carry a warning.
- Replaced the invented `±8` interval and `0.42` standard error with a full-range, explicitly uncalibrated fallback. Results and new PDFs no longer present it as a statistical confidence interval.
- Added RU/KK content review notes in `TEEN_ASSESSMENT_REVIEW.md`. Wording, career weights and scenario scoring still need cognitive interviews and psychometric validation before claims or consequential use.

## 2026-09-26 — Client-approved 75 + 8 pathway (`t-skills-teen-v1`)

- New T-Skills sessions run the client-approved bank: 75 pairwise items, then 8 situational A/B/C/D questions picked from a 25-question pool for the most ambiguous traits (30% of 25); each answer adds a ×2 correction to its trait. Scoring, selection and career matching are server-side and deterministic (`lib/t-skills/teen/runtime.ts`).
- Onboarding now collects a full ranking of 8 values (top 3 feed `value_fit`) and 2–3 subjects chosen from the client's list of 13 (feed `subject_bonus`); age and education level are kept. Free-text subjects are gone.
- Career ranking uses the 170-profession catalog; results and PDF show the top professions, top values and subjects, with KK display names.
- Migration `0023_teen_assessment_version` publishes `t-skills-teen-v1` with career model `teen-career-matching-v1` and retires `t-skills_pairwise_v1` for new sessions. In-flight pairwise sessions keep their frozen versions and career model.
- Deliberately out of scope: the teen flow's 20-pair profession preference stage (3b); `value_fit`/`subject_bonus` stay at the v1 defaults (0.15 / 0.10); «Педагогика» remains a catalog-only tag and is not offered in onboarding.
- RU and KK content bundles are marked `PUBLISHED` (owner approval, 2026-09-26). Landing, FAQ, methodology, catalog and account copy now describe 75 + 8.

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

## 2026-10-04 — Remove legal approval runtime blocker

At the operator’s explicit request, removed the legal approval gate from registration, new assessments and checkout. Legal document review metadata remains descriptive. Public indexing follows its explicit switch.
