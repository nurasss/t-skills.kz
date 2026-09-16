type AccessJwtPayload = {
  sub?: string;
  email?: string;
  name?: string;
  common_name?: string;
  commonName?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
};

export type AccessIdentity = {
  sub?: string;
  email?: string;
  name?: string;
  commonName?: string;
};

type AccessJwk = JsonWebKey & { kid?: string };
type AccessJwks = { keys?: AccessJwk[] };

let cachedJwks: { teamDomain: string; keys: AccessJwk[] } | null = null;

function configuredString(env: Record<string, unknown>, key: string) {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}

function accessTokenFromRequest(request: Request) {
  const assertion = request.headers.get("CF-Access-JWT-Assertion")?.trim();
  if (assertion) return assertion;

  const cookieHeader = request.headers.get("Cookie") ?? "";
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...value] = cookie.trim().split("=");
    if (name === "CF_Authorization") return value.join("=").trim();
  }
  return "";
}

async function getJwks(teamDomain: string, refresh = false) {
  if (!refresh && cachedJwks?.teamDomain === teamDomain) return cachedJwks.keys;
  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, { headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as AccessJwks | null;
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  cachedJwks = { teamDomain, keys };
  return keys;
}

function audienceMatches(audience: string | string[] | undefined, expected: string) {
  return Array.isArray(audience) ? audience.includes(expected) : audience === expected;
}

async function verifyAccessJwt(token: string, teamDomain: string, expectedAudience: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson<{ alg?: string; kid?: string }>(encodedHeader);
  const payload = decodeJson<AccessJwtPayload>(encodedPayload);
  if (!header || !payload || header.alg !== "RS256" || !header.kid) return null;
  if (payload.exp === undefined || payload.exp * 1000 <= Date.now()) return null;
  if (normalizeUrl(String(payload.iss ?? "")) !== teamDomain) return null;
  if (!audienceMatches(payload.aud, expectedAudience)) return null;

  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = decodeBase64Url(encodedSignature);
  let keys = await getJwks(teamDomain);
  let jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    keys = await getJwks(teamDomain, true);
    jwk = keys.find((candidate) => candidate.kid === header.kid);
  }
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signingInput);
    return valid ? payload : null;
  } catch {
    return null;
  }
}

export async function identityFromAccessToken(request: Request, env: Record<string, unknown>): Promise<AccessIdentity | null> {
  const teamDomain = normalizeUrl(configuredString(env, "CF_ACCESS_TEAM_DOMAIN"));
  const expectedAudience = configuredString(env, "CF_ACCESS_AUDIENCE");
  const token = accessTokenFromRequest(request);
  if (!teamDomain || !expectedAudience || !token) return null;

  const payload = await verifyAccessJwt(token, teamDomain, expectedAudience);
  if (!payload) return null;
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    commonName: payload.common_name ?? payload.commonName,
  };
}
