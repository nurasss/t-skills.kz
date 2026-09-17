import { getD1, getRuntimeEnv } from "@/db";
import type { Viewer } from "@/lib/server-auth";

export { constantTimeTokenEqual, safeReturnTo } from "@/lib/auth-utils";

export const SESSION_COOKIE = "orbita_session";
export const SECURE_SESSION_COOKIE = "__Host-orbita_session";
const CSRF_COOKIE = "orbita_csrf";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function isProduction() {
  const env = getRuntimeEnv();
  return (env.APP_ENV ?? env.ORBITA_ENV ?? "").toLowerCase().includes("production");
}

function isLocalEnvironment() {
  const env = getRuntimeEnv();
  return ["development", "test", "local"].includes((env.APP_ENV ?? env.ORBITA_ENV ?? "").trim().toLowerCase());
}

function usesSecureCookies() {
  const configured = getRuntimeEnv().APP_BASE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).protocol === "https:";
    } catch {
      return !isLocalEnvironment();
    }
  }
  return !isLocalEnvironment();
}

function sessionTtlSeconds() {
  const configured = Number(getRuntimeEnv().AUTH_SESSION_TTL_SECONDS);
  if (Number.isInteger(configured) && configured >= 15 * 60 && configured <= 30 * 24 * 60 * 60) return configured;
  return SESSION_TTL_SECONDS;
}

function sessionCookieName() {
  return usesSecureCookies() ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
}

function parseCookies(header: string | null) {
  const result = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name && value) result.set(name, value);
  }
  return result;
}

export function cookieValue(request: Request, name: string) {
  return parseCookies(request.headers.get("cookie")).get(name) ?? null;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function randomToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function newAuthToken() {
  return randomToken();
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function cookieString(name: string, value: string, maxAge: number) {
  const secure = usesSecureCookies() ? "; Secure" : "";
  const prefix = name === SECURE_SESSION_COOKIE ? "; Path=/" : "; Path=/";
  return `${name}=${value}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}${prefix}`;
}

function csrfCookieString(value: string, maxAge: number) {
  const secure = usesSecureCookies() ? "; Secure" : "";
  return `${CSRF_COOKIE}=${value}; Max-Age=${maxAge}; SameSite=Lax${secure}; Path=/`;
}

export async function createCsrfToken() {
  return randomToken();
}

export function setCsrfCookie(response: Response, token: string) {
  response.headers.append("Set-Cookie", csrfCookieString(token, sessionTtlSeconds()));
  return response;
}

export function clearCsrfCookie(response: Response) {
  response.headers.append("Set-Cookie", csrfCookieString("", 0));
  return response;
}

export function csrfCookieValue(request: Request) {
  return cookieValue(request, CSRF_COOKIE);
}

export function setSessionCookie(response: Response, token: string) {
  response.headers.append("Set-Cookie", cookieString(sessionCookieName(), token, sessionTtlSeconds()));
  return response;
}

export function clearSessionCookie(response: Response) {
  for (const name of [SESSION_COOKIE, SECURE_SESSION_COOKIE]) {
    response.headers.append("Set-Cookie", cookieString(name, "", 0));
  }
  return response;
}

function sessionTokenFromRequest(request: Request) {
  const primary = cookieValue(request, sessionCookieName());
  if (primary) return primary;
  // The legacy non-Secure cookie is accepted only by local previews so it
  // cannot become an authentication path in staging or production.
  if (usesSecureCookies()) return null;
  return cookieValue(request, SESSION_COOKIE) ?? cookieValue(request, SECURE_SESSION_COOKIE);
}

export async function createSession(userId: string) {
  const database = getD1();
  const token = randomToken();
  const timestamp = Date.now();
  await database
    .prepare(
      `INSERT INTO auth_sessions (token_hash, user_id, created_at, last_seen_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .bind(await sha256(token), userId, timestamp, timestamp, timestamp + sessionTtlSeconds() * 1000)
    .run();
  return token;
}

export async function revokeSession(request: Request) {
  const token = sessionTokenFromRequest(request);
  if (!token) return;
  await getD1()
    .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`)
    .bind(Date.now(), await sha256(token))
    .run();
}

export async function revokeAllSessions(userId: string) {
  await getD1()
    .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
    .bind(Date.now(), userId)
    .run();
}

export async function createAuthToken(userId: string, type: "email-verification" | "password-reset", ttlSeconds: number) {
  const database = getD1();
  const token = randomToken();
  const timestamp = Date.now();
  const tokenHash = await sha256(token);
  await database.batch([
    database.prepare(`UPDATE auth_tokens SET used_at = ?, consumption_nonce = NULL WHERE user_id = ? AND type = ? AND used_at IS NULL`).bind(timestamp, userId, type),
    database.prepare(`INSERT INTO auth_tokens (token_hash, user_id, type, expires_at, created_at, used_at, consumption_nonce) VALUES (?, ?, ?, ?, ?, NULL, NULL)`).bind(tokenHash, userId, type, timestamp + ttlSeconds * 1000, timestamp),
  ]);
  return token;
}

export async function findAuthToken(rawToken: string, type: "email-verification" | "password-reset") {
  const row = await getD1()
    .prepare(`SELECT token_hash, user_id FROM auth_tokens WHERE token_hash = ? AND type = ? AND expires_at > ? AND used_at IS NULL LIMIT 1`)
    .bind(await sha256(rawToken), type, Date.now())
    .first<{ token_hash: string; user_id: string }>();
  return row ?? null;
}

export function registrationRequiresInvite() {
  const env = getRuntimeEnv();
  const mode = (env.REGISTRATION_MODE ?? "invite-only").trim().toLowerCase();
  return mode !== "public" && env.PUBLIC_SIGNUP_ENABLED?.trim().toLowerCase() !== "true";
}

export function trustedAppBaseUrl(request: Request) {
  const configured = getRuntimeEnv().APP_BASE_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && !isLocalEnvironment()) throw new Error("APP_BASE_URL must use HTTPS outside local development.");
    return url.origin;
  }
  if (isProduction() || !isLocalEnvironment()) throw new Error("APP_BASE_URL is required outside local development.");
  return new URL(request.url).origin;
}

export async function getSessionViewer(request: Request): Promise<Viewer | null> {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;
  try {
    const row = await getD1()
      .prepare(
        `SELECT s.user_id, u.email, u.full_name, u.role
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         JOIN auth_credentials c ON c.user_id = u.id
         WHERE s.token_hash = ?
           AND s.expires_at > ?
           AND s.revoked_at IS NULL
           AND u.deleted_at IS NULL
           AND u.status = 'active'
           AND c.email_verified_at IS NOT NULL
         LIMIT 1`,
      )
      .bind(await sha256(token), Date.now())
      .first<{ user_id: string; email: string; full_name: string | null; role: "user" | "admin" }>();
    if (!row) return null;
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.full_name ?? row.email,
      fullName: row.full_name,
      role: row.role === "admin" ? "admin" : "user",
    };
  } catch {
    return null;
  }
}

export async function sessionTokenHash(token: string) {
  return sha256(token);
}
