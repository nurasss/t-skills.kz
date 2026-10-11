# T-Skills Operations Runbooks

These procedures are a release starting point. Replace `NOT ASSIGNED` values with the real operator, support channel and service targets before public launch.

## Contacts and targets

```text
On-call owner: NOT ASSIGNED
Security/data incident owner: NOT ASSIGNED
Support channel/SLA: NOT ASSIGNED
Public availability target: NOT APPROVED
Answer-save p95 target: <500 ms under approved target load
Report/PDF completion target: p95 <=60 s under approved target load
RTO: NOT APPROVED BY BUSINESS
RPO: NOT APPROVED BY BUSINESS
```

## Duplicate or failed payment webhook

1. Check the provider event ID and payload hash in `payment_events`.
2. A same-hash replay should return idempotent duplicate; a different payload for the same event ID is a conflict and must not grant access.
3. Confirm the order snapshot: provider checkout ID, payment ID, test ID, exact amount, currency and paid status.
4. For late failure/refund/dispute, inspect the monotonic order status and corresponding audit/telemetry event. Do not manually re-grant access from a redirect query.
5. If an order is paid but report generation failed, retry the report job/support action; do not charge or grant a second entitlement.
6. Escalate provider disagreement to the payment/support owner. Refund rights come only from the approved Terms/Refund Policy.

## Delayed checkout and held promo/campaign capacity

1. A local reservation timestamp alone does not release a promo use or campaign seat after a Stripe Checkout Session has been attached. The hold remains until the signed session-completed, async-payment-succeeded/failed, or session-expired event changes the order state.
2. Check the order's `provider_checkout_id`, order status, and reservation row. In Stripe's event deliveries, confirm whether the Checkout Session is still open, complete with payment pending, or expired; async Checkout payment methods emit separate success/failure events ([Checkout Session events](https://docs.stripe.com/api/checkout/sessions)).
3. For `complete` with `payment_status=unpaid`, keep the hold and wait for the async terminal event. For an expired/unpaid session, retry its signed webhook delivery; endpoint event IDs are idempotent and the handler releases the hold.
4. Do not manually release a provider-backed reservation while payment status is pending. Escalate a provider/session mismatch to the payment owner and preserve the order/session IDs and request IDs in the restricted incident record.

## Stripe refund state and reconciliation

1. Before initiating another refund, the admin endpoint lists the Stripe refunds for the order's PaymentIntent or Charge, totals only `succeeded` refunds and refuses to proceed while any refund is `pending` or `requires_action`.
2. `REFUND_PENDING` means Stripe accepted the request or its outcome is uncertain. Do not submit a second refund from Stripe Dashboard or edit D1 directly. Check the order's `payment_events`, admin audit timeline and the provider refund list; wait for the signed `refund.updated` or `charge.refunded` event, then retry the webhook delivery if needed.
3. A partial refund keeps access active and the order in `PARTIALLY_REFUNDED`. The next admin refund request sends only the remaining balance. Access is revoked and campaign membership is removed only after the cumulative successful refund reaches the order amount.
4. `REFUND_FAILED` records an explicit provider rejection. Verify the current refund list before retrying; the application rechecks successful and pending refund amounts before sending a new request.
5. If a `REFUND_PENDING` order has no corresponding provider refund and no webhook arrives, escalate to the payment owner for provider-side reconciliation. Keep the hold visible, preserve request/event IDs, and never manually grant or revoke access from a redirect or customer claim.
6. Commercial refund eligibility remains governed by the approved Terms and Refund Policy. The code records provider state; it does not define consumer rights.

## Stuck assessment or report

1. Identify the current user through the authenticated Site identity; never request raw answers in a general support channel.
2. Inspect assessment state, `updated_at`, `report_id`, `error_code`, `adaptive_runs` and `reports` metadata.
3. For a report in `REPORT_FAILED_RETRYABLE`, call the owner-scoped regenerate route once, respecting its rate limit.
4. Regeneration must reuse the frozen `score_json`; compare the score snapshot before/after.
5. If the PDF is missing in R2, recreate only the report/PDF layer. Do not recalculate a frozen score, regenerate an accepted adaptive set, or alter historical v1 Q001–Q300 snapshots.

## v2 Mercury generation recovery

1. Inspect `adaptive_generation_status`, `adaptive_generation_attempts`, `adaptive_generation_lock`, `adaptive_runs` and `adaptive_questions` for the owner-scoped assessment.
2. `ADAPTIVE_GENERATING` older than the lock timeout is recoverable by the owner-scoped complete-core retry; an accepted `adaptive_questions` snapshot must always be reused.
3. `ADAPTIVE_PROVIDER_FAILED` may be retried within the bounded generation-attempt limit. Missing key, timeout, 429, 5xx or invalid output must end in `ADAPTIVE_FALLBACK`, never in random questions.
4. Never copy raw AdaptiveContext, answers, PII, API keys or provider output into a ticket. Record only provider, model, latency, attempt count, token counts, validation/fallback reason and question count.

## Suspected ownership takeover or data incident

1. Treat any cross-user disclosure, secret exposure, public R2 object or webhook bypass as highest severity.
2. Preserve request IDs, event IDs, timestamps and safe error codes; do not copy answers, tokens, emails or secrets into tickets.
3. Restrict/privatize the Site, revoke/rotate managed secrets, disable affected provider paths and preserve the relevant audit evidence.
4. Notify the security/data incident owner and legal/privacy owner; assess notification duties under the approved jurisdictional policy.
5. Write a postmortem with scope, timeline, containment, root cause, regression test and release decision.

## Export and deletion

- Export is owner-scoped and includes the stored user, order, assessment, response, report, adaptive and consent data; the export artifact is private R2.
- Account deletion removes R2 artifacts before dependent D1 rows, then anonymizes the user. If R2 deletion fails, the privacy request is marked `FAILED_RETRYABLE` and completion is not claimed.
- Assessment deletion applies the same order to one session and physically purges its response rows.
- Retention dry-run must be reviewed before activation. Active states are excluded. A real purge must be rerun after any failed artifact deletion and reconciled against the D1/R2 counts.

## Migration, backup and restore

1. Take/verify the managed D1 backup according to the operator schedule before migration.
2. Review the migration SQL and previous schema snapshot; apply migrations in order to staging first.
3. Run `npm run test:backup` locally and the managed staging restore drill. Record backup ID, restore target, row checks, elapsed time and RTO/RPO result.
4. For rollback, stop writes, preserve the failed release evidence, restore the last approved snapshot or forward-fix with a new migration. Never rewrite an applied migration or use destructive Git reset.
5. Verify secrets, D1/R2 bindings, cron and webhook endpoint isolation before resuming traffic.

## Retention job

- Cron: `0 2 * * *`.
- Start with `RETENTION_DRY_RUN=true`; review candidate count, artifact keys and failed-artifact count.
- Run real purge only after approved policy and backup-deletion semantics are recorded.
- Alert on any failed artifact, D1 purge failure or repeated job absence. The job is designed to be idempotent.

## Release and rollback checklist

1. Confirm all gate statuses in `FINAL_ACCEPTANCE.md`; open external gates block the corresponding launch.
2. Use the Git SHA and source archive hash from `RELEASE_MANIFEST.json`; do not upload workspace ZIP or `node_modules`.
3. Push the exact SHA to the private Site, save a version, deploy privately, and verify the URL, headers, auth boundary, catalog and smoke flow.
4. If the deployed version regresses, redeploy the last approved Site version and preserve both deployment IDs in the incident record.
5. Public indexing follows the explicit `PUBLIC_INDEXING_ENABLED` switch. Legal review metadata no longer blocks registration, assessments, checkout or indexing. With `APP_BASE_URL=https://t-skills.kz` configured, verify `GET /robots.txt` allows the approved public pages and the sitemap contains only those pages (otherwise search engines get a full `Disallow: /`).

### Manual VPS deployment over SSH

1. Confirm the SSH alias resolves to the intended VPS and inspect `df -h /opt`. Keep at least 2 GB free before a full source Docker build. Never prune Docker globally on the shared host; other services and rollback images use the same daemon.
2. Sync the reviewed source snapshot without deleting remote files. Exclude `.git`, `node_modules`, generated output, application data and every `.env` file. Preserve `/opt/t-skills/deploy/vps/.env` and keep it mode `0600`.
3. Tag the current `t-skills:vps` image as a rollback image, then build the candidate with the Linux VPS target. Do not replace the running container until the build succeeds.
4. Stop only `app`, back up the complete `tskills-data` volume, and recreate only `app` with the candidate image. Keep the backup restricted because it contains personal data.
5. Verify the migration count in app logs, then check public `/api/health`, `/api/catalog`, `/robots.txt`, homepage, privacy/terms pages and an unauthenticated admin request. Confirm legal, payment and AI flags match the approved rollout state.
6. On regression, retag the saved image as `t-skills:vps` and recreate only `app` with `--no-build --force-recreate` only if the previous image understands the current data/version snapshots. If a migration changed stored version metadata or schema, image-only rollback is unsafe: restore the matching snapshot with the app stopped, or forward-fix. Record image IDs and snapshot hashes in `DEPLOYMENT_EVIDENCE.md`.
