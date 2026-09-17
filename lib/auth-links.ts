export type AuthLinkMode = "register" | "reset" | "verify";

/**
 * Put one-time auth material in the URL fragment. Fragments are not sent in
 * HTTP requests and therefore do not land in origin request logs or ordinary
 * Referer headers. The client still supports query-string links issued by an
 * older deployment for a bounded migration window.
 */
export function buildAuthActionUrl(baseUrl: string, mode: AuthLinkMode, token: string, parameter = mode === "register" ? "invite_token" : "token") {
  const url = new URL("/auth", baseUrl);
  url.searchParams.set("mode", mode);
  url.hash = `${parameter}=${encodeURIComponent(token)}`;
  return url.toString();
}
