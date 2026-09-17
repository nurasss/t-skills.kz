import { getRuntimeEnv } from "@/db";
import { consumeRateLimit } from "@/lib/durable-store";

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rateLimitSecret() {
  const configured = getRuntimeEnv().AUTH_RATE_LIMIT_SECRET?.trim();
  if (configured) return configured;
  const environment = (getRuntimeEnv().APP_ENV ?? getRuntimeEnv().ORBITA_ENV ?? "").trim().toLowerCase();
  if (["development", "test", "local"].includes(environment)) return "local-rate-limit-salt";
  // Never silently run a production limiter with a predictable salt.
  throw new Error("AUTH_RATE_LIMIT_SECRET_MISSING");
}

async function rateLimitIdentity(request: Request, scope: string, account?: string) {
  // Only Cloudflare's edge-set address is trusted. User-controlled forwarding
  // headers would let a caller rotate the apparent IP and evade the limit.
  const forwarded = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
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
