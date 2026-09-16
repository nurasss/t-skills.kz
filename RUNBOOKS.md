# ORBITA-30 Operations Runbooks

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
