# T-Skills Security Review

Status: engineering review for a private controlled-pilot release. This is not a public penetration-test certificate.

## Threat model and controls

| Threat | Control | Evidence / remaining gate |
|---|---|---|
| User A reads User B objects by guessing IDs | Every assessment, order, report, export and delete query includes server-side `user_id` ownership; application sessions are resolved server-side | `scripts/e2e-smoke.mjs`, `lib/app-auth.ts` |
| Cross-origin state-changing request | Same-origin/origin, Fetch Metadata and CSRF checks on mutation routes (including pre-auth flows) | `lib/api-response.ts`, E2E CSRF assertion |
| Development preview identity in a conflicting production configuration | Preview identities, local rate-limit salt, local email suppression and fault injection are enabled only when every configured app/runtime marker is local | `lib/auth-utils.ts`, `lib/server-auth.ts`, `lib/app-auth.ts`, `tests/auth.test.ts` |
| Session cookie insecure because a production URL was misconfigured as HTTP | Outside a fully local environment, session cookies always require `Secure`/`__Host-` semantics; non-HTTPS `APP_BASE_URL` also fails auth-link creation | `lib/app-auth.ts`, `lib/auth-utils.ts`, `tests/auth.test.ts` |
| Provider changes score or invents claims | Deterministic score snapshot, strict schemas, source-key grounding and post-validation | `lib/provider-contract.ts`, `lib/report-safety.ts`, unit tests |
| Adaptive provider invents question or score rule | Mercury returns only structured question content; v2 server validator restricts traits/reasons/formats/safety/duplicates, while deterministic scoring owns all weights and Top 5 | `lib/mercury-adaptive-provider.ts`, `lib/orbita-v2-engine.ts`, `tests/mercury-adaptive.test.ts` |
| Webhook grants without payment | HMAC signature, timestamp, exact checkout/order/test/amount/currency/status snapshot and idempotent event row | `lib/payment-provider.ts`, `lib/payment-integrity.ts`, E2E mismatch/race |
| Replay/downgrade payment event | Provider event uniqueness and monotonic operational state | `lib/payment-event-policy.ts`, E2E refund/dispute |
| Duplicate or partial refund mishandled | CSRF-protected admin route, atomic order claim, provider refund-list reconciliation, exact remaining amount, full-versus-partial status and access revocation only on cumulative full refund | `app/api/admin/orders/[id]/refund/route.ts`, `lib/stripe-refunds.ts`, `lib/admin-store.ts`, `scripts/e2e-smoke.mjs` |
| Late paid webhook reactivates a refunded entitlement | SQL status transition is evaluated against the current row, and entitlement/promo/campaign writes require the post-transition order not be fully refunded | `lib/durable-store.ts`, `scripts/e2e-smoke.mjs` |
| Concurrent role changes remove all root administrators | Last SUPER_ADMIN revocation is guarded by an atomic active-assignment count in the update predicate | `lib/admin-store.ts`, `tests/database-integrity.test.ts` |
| Audit IP hash uses predictable salt | IP hash is omitted when the managed audit/rate-limit secret is absent | `lib/admin-rbac.ts` |
| Delayed webhook frees a paid promo/campaign slot early | An attached provider session keeps its reservation beyond the local TTL until a terminal signed event; only unattached stale orders are reaped | `lib/durable-store.ts`, late async-payment E2E |
| Oversized anonymous Teen PDF request | Content-Length precheck plus streaming byte limit; bounded report arrays/text and per-IP rate limit | `app/api/teen/pdf/route.ts`, `lib/request-validation.ts`, E2E streamed-body rejection |
| Parallel verification/reset request | Single-use auth token is claimed with a per-consumption nonce inside a D1 batch; dependent credential/user updates require the same nonce | `app/api/auth/verify-email/route.ts`, `app/api/auth/reset-password/route.ts`, `drizzle/0015_steady_thunderbird.sql` |
| PDF token theft/tampering | HMAC grant, five-minute expiry, report/user binding, private R2 read | `lib/pdf-access.ts`, `lib/pdf-token-policy.ts`, E2E negative paths |
| Secret leakage | Managed runtime values only; source scanner blocks private keys, payment/provider secret patterns and generated state in tracked/untracked files and reachable Git history | `scripts/security-scan.mjs` |
| Log leakage | Structured request logs normalize IDs and emit only method/route/status/latency/error code; analytics is allowlisted | `lib/observability.ts`, `lib/analytics.ts` |
| Unapproved operator/legal facts published as defaults | Default legal facts are non-factual draft labels; registration/new assessments/checkout/indexing stay closed outside local/staging until all fields and an explicit signed-approval marker are present | `lib/legal-policy.ts`, `lib/legal-config.ts`, `lib/seo-config.ts`, `tests/legal-config.test.ts` |
| Database loss | D1 migration chain and export/restore smoke; recovery procedure | `scripts/backup-restore-smoke.mjs`, `RUNBOOKS.md` |
| Retention/deletion failure | R2 deletion precedes D1 purge; dry-run default; active states excluded | `lib/retention.ts`, `lib/retention-policy.ts`; managed drill OPEN |

## Source and dependency checks

- `npm run security:scan` checks tracked and untracked source plus reachable Git history and fails on private-key, Stripe secret, OpenAI secret, webhook secret, generated-state and missing-file findings.
- `/.well-known/security.txt` stays disabled until a real `SECURITY_CONTACT_EMAIL` is configured; the public security contact must be verified before launch.
- `INCEPTION_API_KEY` is a server-only managed secret; it is absent from `.env.example` values, client code, telemetry, exports, PDFs and logs. The Mercury payload contains only the minimized v2 `AdaptiveContext`.
- `npm run audit:check` and `npm run ci:verify` audit runtime and development dependencies. The 2026-10-04 full audit reports 10 dependency-path findings for one high severity advisory, `GHSA-vfj7-8cjw-p6xm`, affecting dev-only `braces@3.0.3` through `depcheck`, Next ESLint, and Vinext build tooling. The GitHub Advisory Database lists no patched release; upstream fix [PR #72](https://github.com/micromatch/braces/pull/72) remains open. Do not apply `npm audit fix --force`: npm proposes a breaking downgrade of `depcheck` and does not resolve the lack of an upstream patch. Recheck the advisory before each release.
- `npm audit --omit=dev --audit-level=moderate` passes with zero production dependency vulnerabilities. The GitHub Actions workflow currently audits production dependencies only; the full local `ci:verify` remains blocked by the unpatched development-tool advisory.
- Provider responses are read through bounded streaming JSON readers (128 KiB for adaptive/Mercury, 256 KiB for reports, 64 KiB for Stripe checkout) before parsing; oversized or malformed output falls back or fails closed.
- Stripe Checkout redirects accept only the HTTPS hosted `checkout.stripe.com/c/pay/...` URL returned by the official API; malformed or unexpected provider URLs fail closed and are never sent to the browser.
- The release package is built by `npm run package:source` from Git-visible source, not from a workspace ZIP or local `node_modules`.
- `npm ci` and the full CI workflow are pinned to the lockfile and Node `22.13.0` in `.github/workflows/ci.yml`.

## Accepted/open risks

The current source has first-party email/password authentication with verified e-mail, opaque revocable sessions, invite-only registration by default, CSRF/origin checks, independent D1-backed IP/account rate-limit windows and role-gated admin routes. Production accepts only the Secure `__Host-orbita_session`; the legacy non-Secure cookie is restricted to local previews. MFA, passwordless recovery options and an external penetration test are not implemented/verified yet. A production operator must provide separate staging/prod D1/R2/secrets/webhook endpoints, managed secret rotation, WAF/CDN policy, alert routing, backup retention and incident contacts. Legacy identity headers are stripped by the Worker and are not trusted by application routes.

One-time verification, password-reset and invite values are delivered in URL fragments rather than query strings, then removed from browser history after client capture. The server continues to accept the previous query-string shape only to support links issued before this change.

The current source emits a per-request nonce and has no `unsafe-inline` or `unsafe-eval` in `script-src`; the real-browser regression covers hydration and checkout navigation. `style-src 'unsafe-inline'` remains a documented runtime compatibility allowance. Deployed staging verification, external pentest and remediation/retest are still open gates and are not treated as permission to launch publicly.

Refunds with an unknown provider outcome remain `REFUND_PENDING`; the application will not send a second refund while a provider operation may still be active. The operator runbook requires checking Stripe and retrying its signed webhook. A live Stripe account transaction and the manual recovery path have not been exercised in this local audit.

No card PAN/CVC, legal approval, norm, psychometric validity, or security certification is claimed by this repository.
