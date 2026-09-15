export const REQUEST_ID_HEADER = "X-Request-ID";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

export function requestIdFrom(request: Request) {
  const supplied = request.headers.get(REQUEST_ID_HEADER)?.trim();
  if (supplied && REQUEST_ID_PATTERN.test(supplied)) return supplied;
  return crypto.randomUUID();
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com",
  ].join("; "),
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
};

export function applySecurityHeaders(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  headers.set(REQUEST_ID_HEADER, requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function normalizeRoute(pathname: string) {
  return pathname
    .replace(/\b(?:sess|ord|rep|privacy|aud|tel|adaptive|ent)_[A-Za-z0-9_-]+\b/g, ":id")
    .replace(/\/(?:[A-Za-z0-9_-]{24,})\b/g, "/:id");
}
