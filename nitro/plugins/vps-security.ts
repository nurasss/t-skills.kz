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

export default function vpsSecurity(nitroApp: NitroApp) {
  nitroApp.hooks?.hook("request", (event) => {
    const nodeEvent = asNodeEvent(event);
    const rawHeaders = nodeEvent.node.req.headers;
    for (const header of STRIPPED_HEADERS) delete rawHeaders[header];
    const requestId = requestIdFrom(snapshotRequest(rawHeaders));
    const nonce = createCspNonce();
    rawHeaders["content-security-policy"] = contentSecurityPolicy(nonce);
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
