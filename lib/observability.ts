import { normalizeRoute } from "@/lib/security-headers";

export type RequestLog = {
  event: "request_completed" | "request_failed";
  request_id: string;
  method: string;
  route: string;
  status?: number;
  latency_ms?: number;
  error_code?: string;
};

function safeErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_.:-]{1,80}$/.test(code)) return code;
  }
  return "INTERNAL_SERVER_ERROR";
}

export function buildRequestLog(input: {
  request: Request;
  requestId: string;
  status?: number;
  latencyMs?: number;
  error?: unknown;
}): RequestLog {
  const log: RequestLog = {
    event: input.error ? "request_failed" : "request_completed",
    request_id: input.requestId,
    method: input.request.method,
    route: normalizeRoute(new URL(input.request.url).pathname),
  };
  if (typeof input.status === "number") log.status = input.status;
  if (typeof input.latencyMs === "number") log.latency_ms = Math.max(0, Math.round(input.latencyMs));
  if (input.error) log.error_code = safeErrorCode(input.error);
  return log;
}

export function logRequest(input: Parameters<typeof buildRequestLog>[0]) {
  const record = buildRequestLog(input);
  if (record.event === "request_failed") console.error(record);
  else console.info(record);
  return record;
}
