// VPS (nitro node-server) equivalent of worker/index.ts.
//
// The Cloudflare Worker wraps every request with: untrusted identity-header
// stripping, per-request CSP nonce + security headers, request IDs and
// structured request logging, plus a scheduled retention sweep. Nitro builds
// do not use worker/index.ts, so this server plugin replicates the HTTP part
// of that wrapper one-to-one. Retention on VPS runs via system cron calling
// POST /internal/retention (see docs/VPS_DEPLOY.md).
//
// Local structural types are used instead of the nitro beta event types:
// only the node-server preset is supported here, where node req/res are
// always present.
import type { NitroApp } from "nitro/types";
import {
  applySecurityHeaders,
  contentSecurityPolicy,
  createCspNonce,
  requestIdFrom,
} from "@/lib/security-headers";
import { logRequest } from "@/lib/observability";

const STRIPPED_HEADERS = [
  "x-orbita-access-sub",
  "x-orbita-access-email",
  "x-orbita-access-name",
  "oai-authenticated-user-id",
  "oai-authenticated-user-email",
  "oai-authenticated-user-full-name",
  "oai-authenticated-user-full-name-encoding",
];

type NodeHeaders = Record<string, string | string[] | undefined>;

type NodeEvent = {
  // Nitro/H3 exposes the Fetch-compatible request used by the renderer in
  // addition to the underlying Node request. Keep both views in sync: Vinext
  // reads the former when extracting the CSP nonce for SSR inline scripts.
  req?: Request;
  node: {
    req: { headers: NodeHeaders };
    res: { setHeader: (name: string, value: string) => void; headersSent?: boolean };
  };
  context: Record<string, unknown>;
};

function asNodeEvent(event: unknown): NodeEvent {
  return event as NodeEvent;
}

function snapshotRequest(headers: NodeHeaders): Request {
  const init = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) init.append(name, entry);
  }
  return new Request("http://localhost/", { headers: init });
}

function synchronizeFetchRequestHeaders(
  nodeEvent: NodeEvent,
  remove: readonly string[],
  set: Record<string, string>,
) {
  const request = nodeEvent.req;
  if (!request) return;

  const apply = (headers: Headers) => {
    for (const name of remove) headers.delete(name);
    for (const [name, value] of Object.entries(set)) headers.set(name, value);
  };
  const synchronized = (headers: Headers) =>
    remove.every((name) => !headers.has(name)) &&
    Object.entries(set).every(([name, value]) => headers.get(name) === value);

  // Some runtimes expose a mutable Headers object, while incoming Fetch
  // Requests in other runtimes expose an immutable one. Try the cheap path
  // first, but never let an immutable request abort the whole HTTP request.
  try {
    apply(request.headers);
    if (synchronized(request.headers)) return;
  } catch {
    // Fall through to a replacement Request with a mutable Headers instance.
  }

  try {
    const headers = new Headers(request.headers);
    apply(headers);
    const replacement = new Request(request, { headers });

    // H3/Nitro may attach runtime-only properties to the request. Preserve
    // the common ones when replacing an immutable Fetch Request.
    const source = request as unknown as Record<string, unknown>;
    const target = replacement as unknown as Record<string, unknown>;
    for (const key of ["context", "runtime", "waitUntil", "ip", "originalUrl"]) {
      if (!(key in source)) continue;
      try {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: false,
          value: source[key],
          writable: true,
        });
      } catch {
        // The standard Request surface is still valid without this metadata.
      }
    }
    nodeEvent.req = replacement;
  } catch {
    // The raw Node request has already been sanitized. If this runtime also
    // forbids cloning the Fetch Request, keep serving from that safe view.
  }
}

function setRequestCsp(nodeEvent: NodeEvent, csp: string) {
  nodeEvent.node.req.headers["content-security-policy"] = csp;
  synchronizeFetchRequestHeaders(nodeEvent, STRIPPED_HEADERS, { "content-security-policy": csp });
}

export default function vpsSecurity(nitroApp: NitroApp) {
  nitroApp.hooks?.hook("request", (event) => {
    const nodeEvent = asNodeEvent(event);
    const rawHeaders = nodeEvent.node.req.headers;
    for (const headerName of Object.keys(rawHeaders)) {
      if (STRIPPED_HEADERS.includes(headerName.toLowerCase())) delete rawHeaders[headerName];
    }
    const requestId = requestIdFrom(snapshotRequest(rawHeaders));
    const nonce = createCspNonce();
    setRequestCsp(nodeEvent, contentSecurityPolicy(nonce));
    nodeEvent.context.vpsRequestId = requestId;
    nodeEvent.context.vpsCspNonce = nonce;
    nodeEvent.context.vpsStartedAt = Date.now();
  });

  nitroApp.hooks?.hook("response", (res, event) => {
    const nodeEvent = asNodeEvent(event);
    const requestId =
      (nodeEvent.context.vpsRequestId as string | undefined) ??
      requestIdFrom(snapshotRequest(nodeEvent.node.req.headers));
    const nonce = nodeEvent.context.vpsCspNonce as string | undefined;
    const startedAt = (nodeEvent.context.vpsStartedAt as number | undefined) ?? Date.now();
    const secured = applySecurityHeaders(res, requestId, nonce);
    if (!nodeEvent.node.res.headersSent) {
      secured.headers.forEach((value, name) => nodeEvent.node.res.setHeader(name, value));
    }
    logRequest({
      request: snapshotRequest(nodeEvent.node.req.headers),
      requestId,
      status: secured.status,
      latencyMs: Date.now() - startedAt,
    });
  });
}
