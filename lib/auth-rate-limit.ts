import { getRuntimeEnv } from "@/db";
import { consumeRateLimit } from "@/lib/durable-store";
import { isLocalAuthEnvironment } from "@/lib/auth-utils";

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rateLimitSecret() {
  const env = getRuntimeEnv();
  const configured = env.AUTH_RATE_LIMIT_SECRET?.trim();
  if (configured) return configured;
  if (isLocalAuthEnvironment(env)) return "local-rate-limit-salt";
  // Never silently run a production limiter with a predictable salt.
  throw new Error("AUTH_RATE_LIMIT_SECRET_MISSING");
}

function clientAddress(request: Request): string {
  // Only Cloudflare's edge-set address is trusted. User-controlled forwarding
  // headers would let a caller rotate the apparent IP and evade the limit.
  const edge = request.headers.get("CF-Connecting-IP")?.trim();
  if (edge) return edge;
  // VPS deployments sit behind exactly one trusted reverse proxy (Caddy),
  // which appends the real client address to X-Forwarded-For. Trust it only
  // when the operator explicitly enabled TRUST_PROXY; otherwise an attacker
  // could spoof the header directly.
  if (getRuntimeEnv().TRUST_PROXY?.trim().toLowerCase() === "true") {
    const forwarded = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "unknown";
}

async function rateLimitIdentity(request: Request, scope: string, account?: string) {
  const forwarded = clientAddress(request);
  const secret = rateLimitSecret();
  return `rate:${scope}:${await digest(`${secret}:${forwarded}:${account ?? ""}`)}`;
}

async function accountRateLimitIdentity(scope: string, account: string) {
  const secret = rateLimitSecret();
  return `rate:${scope}:account:${await digest(`${secret}:${account.trim().toLowerCase()}`)}`;
}

export async function checkAuthRateLimit(request: Request, scope: string, limit: number, windowMs: number, account?: string) {
  const checks = [
    consumeRateLimit({
      userId: await rateLimitIdentity(request, `${scope}:ip`),
      scope: `auth:${scope}:ip`,
      limit,
      windowMs,
    }),
  ];
  if (account?.trim()) {
    checks.push(
      consumeRateLimit({
        userId: await rateLimitIdentity(request, `${scope}:account-ip`, account),
        scope: `auth:${scope}:account-ip`,
        limit,
        windowMs,
      }),
      consumeRateLimit({
        userId: await accountRateLimitIdentity(scope, account),
        scope: `auth:${scope}:account`,
        limit,
        windowMs,
      }),
    );
  }
  const results = await Promise.all(checks);
  const denied = results.filter((result) => !result.allowed);
  return {
    allowed: denied.length === 0,
    retryAfterSeconds: denied.length ? Math.max(...denied.map((result) => result.retryAfterSeconds)) : 0,
  };
}
