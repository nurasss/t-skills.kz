function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export async function verifyStripeSignature(payload: string, signature: string | null, secret: string, nowMs = Date.now()) {
  if (!signature) return false;
  const parts = signature.split(",");
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const timestamp = Number(timestampPart?.slice(2));
  if (!Number.isInteger(timestamp) || Math.abs(nowMs / 1000 - timestamp) > 300) return false;
  const expected = await hmac(secret, `${timestamp}.${payload}`);
  return parts.filter((part) => part.startsWith("v1=")).some((part) => constantTimeEqual(expected, part.slice(3)));
}
