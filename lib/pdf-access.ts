import { getRuntimeEnv } from "@/db";
import { validatePdfGrantClaims } from "@/lib/pdf-token-policy";

export type PdfDownloadGrant = {
  reportId: string;
  userId: string;
  expiresAt: number;
};

const GRANT_TTL_SECONDS = 5 * 60;

function signingSecret() {
  return getRuntimeEnv().PDF_SIGNING_SECRET?.trim();
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createPdfDownloadToken(reportId: string, userId: string) {
  const secret = signingSecret();
  if (!secret) throw new Error("PDF_SIGNING_SECRET_MISSING");
  const expiresAt = Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS;
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ reportId, userId, expiresAt })));
  const signature = await crypto.subtle.sign("HMAC", await getKey(secret), new TextEncoder().encode(payload));
  return { token: `${payload}.${base64Url(new Uint8Array(signature))}`, expiresAt };
}

export async function verifyPdfDownloadToken(token: string): Promise<PdfDownloadGrant | null> {
  const secret = signingSecret();
  if (!secret) return null;
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length > 0) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getKey(secret),
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    return validatePdfGrantClaims(parsed);
  } catch {
    return null;
  }
}
