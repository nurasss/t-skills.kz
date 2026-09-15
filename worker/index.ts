import handler from "vinext/server/fetch-handler";

import { runRetentionSweep } from "@/lib/retention";
import { applySecurityHeaders, requestIdFrom } from "@/lib/security-headers";
import { logRequest } from "@/lib/observability";

const worker = {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    const requestId = requestIdFrom(request);
    const startedAt = Date.now();
    try {
      const response = await handler.fetch(request, env, ctx);
      logRequest({ request, requestId, status: response.status, latencyMs: Date.now() - startedAt });
      return applySecurityHeaders(response, requestId);
    } catch (error) {
      logRequest({ request, requestId, status: 500, latencyMs: Date.now() - startedAt, error });
      throw error;
    }
  },
  async scheduled(_controller: ScheduledController, env: { DB: D1Database; BUCKET: R2Bucket; RETENTION_DRY_RUN?: string }, ctx: ExecutionContext) {
    const configuredDryRun = env.RETENTION_DRY_RUN?.trim().toLowerCase();
    ctx.waitUntil(runRetentionSweep({
      database: env.DB,
      bucket: env.BUCKET,
      dryRun: configuredDryRun === undefined || configuredDryRun === "" || configuredDryRun === "true",
    }).catch(() => console.error("retention_scheduled_failed", { error_code: "RETENTION_SCHEDULED_FAILED" })));
  },
};

export default worker;
