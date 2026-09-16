import handler from "vinext/server/fetch-handler";

import { runRetentionSweep } from "@/lib/retention";
import { applySecurityHeaders, contentSecurityPolicy, createCspNonce, requestIdFrom } from "@/lib/security-headers";
import { logRequest } from "@/lib/observability";

const worker = {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    const requestId = requestIdFrom(request);
    const nonce = createCspNonce();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-orbita-access-sub");
    requestHeaders.delete("x-orbita-access-email");
    requestHeaders.delete("x-orbita-access-name");
    if (env.AUTH_PROVIDER === "cloudflare-access") {
      const access = (ctx as ExecutionContext & {
        access?: { getIdentity(): Promise<{ sub?: string; email?: string; name?: string; commonName?: string } | null> };
      }).access;
      if (!access) return applySecurityHeaders(new Response("Access required", { status: 401 }), requestId, nonce);
      const identity = await access.getIdentity();
      const subject = identity?.sub?.trim() || identity?.commonName?.trim();
      const email = identity?.email?.trim().toLowerCase()
        || (identity?.commonName ? `${identity.commonName.replace(/[^a-zA-Z0-9._-]/g, "_")}@service.invalid` : "");
      if (!subject || !email) return applySecurityHeaders(new Response("Access identity required", { status: 401 }), requestId, nonce);
      requestHeaders.set("x-orbita-access-sub", subject);
      requestHeaders.set("x-orbita-access-email", email);
      if (identity?.name) requestHeaders.set("x-orbita-access-name", identity.name);
    }
    requestHeaders.set("Content-Security-Policy", contentSecurityPolicy(nonce));
    const securedRequest = new Request(request, { headers: requestHeaders });
    const startedAt = Date.now();
    try {
      const response = await handler.fetch(securedRequest, env, ctx);
      logRequest({ request, requestId, status: response.status, latencyMs: Date.now() - startedAt });
      return applySecurityHeaders(response, requestId, nonce);
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
