# Rollback runbook

1. Stop invitations and record the failed deployment run, Worker version and Git SHA.
2. If smoke fails before a destructive migration, redeploy the previous known-good Git SHA with the same environment.
3. Confirm that the previous Worker is compatible with the current D1 schema and R2 object format before rollback.
4. For any irreversible migration, take and verify a D1 backup before deployment. Restore into staging first and validate assessment state, ownership, report, PDF object and all version IDs.
5. Never point one environment at the other environment's D1 or R2 as a rollback shortcut.
6. Keep `RETENTION_DRY_RUN=true` until the restored environment passes smoke.

Failure policy: failed CI means no deployment; failed staging means no production; failed production smoke means stop rollout and redeploy the previous Worker version. No response loss may be hidden or treated as success.
