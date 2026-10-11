const LOCAL_AUTH_ENVIRONMENTS = new Set(["development", "test", "local"]);

/** Preview identities are allowed only when every configured app/runtime marker is local. */
export function isLocalAuthEnvironment(environment: { APP_ENV?: string; ORBITA_ENV?: string }) {
  const configured = [environment.APP_ENV, environment.ORBITA_ENV]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  return configured.length > 0 && configured.every((value) => LOCAL_AUTH_ENVIRONMENTS.has(value));
}

export function shouldUseSecureSessionCookie(environment: { APP_ENV?: string; ORBITA_ENV?: string }, appBaseUrl?: string) {
  if (!isLocalAuthEnvironment(environment)) return true;
  if (!appBaseUrl?.trim()) return false;
  try {
    return new URL(appBaseUrl).protocol === "https:";
  } catch {
    return true;
  }
}

export function constantTimeTokenEqual(left: string | null, right: string | null) {
  if (!left || !right) return false;
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  try {
    const url = new URL(value, "https://orbita.local");
    if (url.origin !== "https://orbita.local" || ["/auth", "/signin-with-chatgpt", "/callback"].includes(url.pathname)) return "/account";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/account";
  }
}
