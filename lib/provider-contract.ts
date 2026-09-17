export type StrictJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "EMPTY_OUTPUT" | "MALFORMED_JSON" };

export class ProviderResponseTooLargeError extends Error {
  constructor() {
    super("Provider response is too large");
    this.name = "ProviderResponseTooLargeError";
  }
}

export async function readBoundedResponseText(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ProviderResponseTooLargeError();
      }
      chunks.push(decoder.decode(result.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedResponseJson(response: Response, maxBytes: number) {
  return JSON.parse(await readBoundedResponseText(response, maxBytes)) as unknown;
}

function extractProviderOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const pieces: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") pieces.push(text);
    }
  }
  return pieces.join("\n");
}

export function parseStrictJsonProviderOutput(payload: Record<string, unknown>): StrictJsonResult {
  const text = extractProviderOutputText(payload).trim();
  if (!text) return { ok: false, reason: "EMPTY_OUTPUT" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "MALFORMED_JSON" };
  }
}

export function providerFailureReason(error: unknown, namespace: "REPORT" | "ADAPTIVE") {
  const prefix = namespace === "REPORT" ? "OPENAI" : "ADAPTIVE";
  if (error instanceof DOMException && error.name === "AbortError") return `${prefix}_TIMEOUT`;
  const message = error instanceof Error ? error.message : "";
  if (message === "OPENAI_ENDPOINT_INVALID") return `${prefix}_ENDPOINT_INVALID`;
  if (/HTTP_\d{3}/.test(message)) return message.slice(0, 80);
  if (/INVALID_JSON|MALFORMED_JSON|EMPTY_OUTPUT/.test(message)) return `${prefix}_INVALID_JSON`;
  if (/SCHEMA_INVALID|VALIDATION_FAILED/.test(message)) return `${prefix}_SCHEMA_INVALID`;
  return `${prefix}_UNAVAILABLE`;
}
