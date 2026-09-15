# Changelog

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
