import handler from "vinext/server/fetch-handler";

import { runRetentionSweep } from "@/lib/retention";

const worker = {
  fetch: handler.fetch,
  async scheduled(_controller: ScheduledController, env: { DB: D1Database; BUCKET: R2Bucket; RETENTION_DRY_RUN?: string }, ctx: ExecutionContext) {
    const configuredDryRun = env.RETENTION_DRY_RUN?.trim().toLowerCase();
    ctx.waitUntil(runRetentionSweep({
      database: env.DB,
      bucket: env.BUCKET,
      dryRun: configuredDryRun === undefined || configuredDryRun === "" || configuredDryRun === "true",
    }).catch((error) => console.error("retention_scheduled_failed", error)));
  },
};

export default worker;
