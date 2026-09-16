# ORBITA-30 Security Review

Status: engineering review for a private controlled-pilot release. This is not a public penetration-test certificate.

## Threat model and controls

| Threat | Control | Evidence / remaining gate |
|---|---|---|
| User A reads User B objects by guessing IDs | Every assessment, order, report, export and delete query includes server-side `user_id` ownership | `scripts/e2e-smoke.mjs`; public multi-user auth remains OPEN |
| Cross-origin state-changing request | Same-origin/origin and Fetch Metadata checks on mutation routes | `lib/api-response.ts`, E2E CSRF assertion |
| Provider changes score or invents claims | Deterministic score snapshot, strict schemas, source-key grounding and post-validation | `lib/provider-contract.ts`, `lib/report-safety.ts`, unit tests |
| Adaptive provider invents question or score rule | Mercury returns only structured question content; v2 server validator restricts traits/reasons/formats/safety/duplicates, while deterministic scoring owns all weights and Top 5 | `lib/mercury-adaptive-provider.ts`, `lib/orbita-v2-engine.ts`, `tests/mercury-adaptive.test.ts` |
| Webhook grants without payment | HMAC signature, timestamp, exact checkout/order/test/amount/currency/status snapshot and idempotent event row | `lib/payment-provider.ts`, `lib/payment-integrity.ts`, E2E mismatch/race |
| Replay/downgrade payment event | Provider event uniqueness and monotonic operational state | `lib/payment-event-policy.ts`, E2E refund/dispute |
| PDF token theft/tampering | HMAC grant, five-minute expiry, report/user binding, private R2 read | `lib/pdf-access.ts`, `lib/pdf-token-policy.ts`, E2E negative paths |
| Secret leakage | Managed runtime values only; tracked-source scanner blocks private keys, payment/provider secret patterns and generated state | `scripts/security-scan.mjs` |
| Log leakage | Structured request logs normalize IDs and emit only method/route/status/latency/error code; analytics is allowlisted | `lib/observability.ts`, `lib/analytics.ts` |
| Database loss | D1 migration chain and export/restore smoke; recovery procedure | `scripts/backup-restore-smoke.mjs`, `RUNBOOKS.md` |
| Retention/deletion failure | R2 deletion precedes D1 purge; dry-run default; active states excluded | `lib/retention.ts`, `lib/retention-policy.ts`; managed drill OPEN |

## Source and dependency checks

- `npm run security:scan` checks all tracked files and fails on private-key, Stripe secret, OpenAI secret, webhook secret, generated-state and missing-file findings.
- `INCEPTION_API_KEY` is a server-only managed secret; it is absent from `.env.example` values, client code, telemetry, exports, PDFs and logs. The Mercury payload contains only the minimized v2 `AdaptiveContext`.
- `npm audit --omit=dev --audit-level=high` is required in CI and release verification. The recorded local run returned `found 0 vulnerabilities`.
- The release package is built by `npm run package:source` from Git-visible source, not from a workspace ZIP or local `node_modules`.
- `npm ci` and the full CI workflow are pinned to the lockfile and Node `22.13.0` in `.github/workflows/ci.yml`.

## Accepted/open risks

The current Site is intentionally private and uses dispatch-owned ChatGPT identity headers. That is suitable only for controlled pilot access; it is not the public multi-user auth, revocation, MFA and support architecture required for G2. A production operator must provide separate staging/prod D1/R2/secrets/webhook endpoints, managed secret rotation, WAF/CDN policy, alert routing, backup retention and incident contacts.

The current source emits a per-request nonce and has no `unsafe-inline` or `unsafe-eval` in `script-src`; the real-browser regression covers hydration and checkout navigation. `style-src 'unsafe-inline'` remains a documented runtime compatibility allowance. Deployed staging verification, external pentest and remediation/retest are still open gates and are not treated as permission to launch publicly.

No card PAN/CVC, legal approval, norm, psychometric validity, or security certification is claimed by this repository.
