const PASSWORD_HASH_VERSION = "v1";
const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BITS = 256;
const DUMMY_SALT = new Uint8Array(PASSWORD_SALT_BYTES).fill(0x5a);
const DUMMY_HASH = new Uint8Array(PASSWORD_KEY_BITS / 8).fill(0xa5);

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password) as unknown as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    material,
    PASSWORD_KEY_BITS,
  );
  return new Uint8Array(bits);
}

export function validatePassword(password: string) {
  const byteLength = encoder.encode(password).byteLength;
  if (byteLength < 12) return "Пароль должен содержать минимум 12 символов.";
  if (byteLength > 128) return "Пароль не должен быть длиннее 128 байт.";
  return null;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `${PASSWORD_HASH_ALGORITHM}$${PASSWORD_HASH_VERSION}$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encodedHash: string | null | undefined) {
  let salt = DUMMY_SALT;
  let expected = DUMMY_HASH;
  let iterations = PASSWORD_ITERATIONS;
  let validFormat = false;

  if (encodedHash) {
    const parts = encodedHash.split("$");
    if (parts.length === 5 && parts[0] === PASSWORD_HASH_ALGORITHM && parts[1] === PASSWORD_HASH_VERSION) {
      const parsedIterations = Number(parts[2]);
      try {
        const parsedSalt = base64UrlToBytes(parts[3]);
        const parsedHash = base64UrlToBytes(parts[4]);
        if (Number.isInteger(parsedIterations) && parsedIterations >= 300_000 && parsedIterations <= 2_000_000 && parsedSalt.length >= 16 && parsedHash.length === PASSWORD_KEY_BITS / 8) {
          iterations = parsedIterations;
          salt = parsedSalt;
          expected = parsedHash;
          validFormat = true;
        }
      } catch {
        // Deliberately continue with a dummy derivation to reduce timing differences.
      }
    }
  }

  const actual = await derivePassword(password, salt, iterations);
  return validFormat && constantTimeEqual(actual, expected);
}

export const passwordHashPolicy = {
  algorithm: PASSWORD_HASH_ALGORITHM,
  version: PASSWORD_HASH_VERSION,
  iterations: PASSWORD_ITERATIONS,
};
