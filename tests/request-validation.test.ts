import assert from "node:assert/strict";
import { test } from "node:test";

import { emailVerificationSchema, readRequestText, RequestBodyTooLargeError } from "@/lib/request-validation";

test("request body reader enforces the byte limit before buffering unbounded input", async () => {
  const request = new Request("https://orbita.local/api/test", { method: "POST", body: "тест" });
  assert.equal(await readRequestText(request, 32), "тест");

  const oversized = new Request("https://orbita.local/api/test", { method: "POST", body: "1234567890" });
  await assert.rejects(readRequestText(oversized, 5), RequestBodyTooLargeError);
});

test("email verification accepts only a bounded JSON token shape", () => {
  assert.equal(emailVerificationSchema.safeParse({ token: "a".repeat(32) }).success, true);
  assert.equal(emailVerificationSchema.safeParse({ token: "a".repeat(31) }).success, false);
  assert.equal(emailVerificationSchema.safeParse({ token: "a".repeat(32), query: "secret" }).success, false);
});
