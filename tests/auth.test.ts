import assert from "node:assert/strict";
import { test } from "node:test";

import { constantTimeTokenEqual, isLocalAuthEnvironment, safeReturnTo, shouldUseSecureSessionCookie } from "@/lib/auth-utils";
import { buildAuthActionUrl } from "@/lib/auth-links";
import { hashPassword, passwordHashPolicy, validatePassword, verifyPassword } from "@/lib/password";

test("password policy hashes with a salted server-side KDF and rejects malformed credentials", async () => {
  const password = "correct horse battery staple";
  const encoded = await hashPassword(password);
  assert.equal(passwordHashPolicy.algorithm, "pbkdf2-sha256");
  assert.equal(passwordHashPolicy.iterations, 600_000);
  assert.match(encoded, /^pbkdf2-sha256\$v1\$600000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
  assert.equal(await verifyPassword(password, "not-a-password-hash"), false);
  assert.equal(validatePassword("short"), "Пароль должен содержать минимум 12 символов.");
  assert.equal(validatePassword(password), null);
});

test("redirect targets remain same-origin and token comparisons are length-safe", () => {
  assert.equal(safeReturnTo("/account?tab=reports#latest"), "/account?tab=reports#latest");
  assert.equal(safeReturnTo("https://evil.example/steal"), "/account");
  assert.equal(safeReturnTo("/\\\\evil.example"), "/account");
  assert.equal(safeReturnTo("//evil.example"), "/account");
  assert.equal(constantTimeTokenEqual("same-token", "same-token"), true);
  assert.equal(constantTimeTokenEqual("same-token", "different"), false);
  assert.equal(constantTimeTokenEqual("same-token", null), false);
});

test("development preview identities fail closed when app/runtime environment markers disagree", () => {
  assert.equal(isLocalAuthEnvironment({ ORBITA_ENV: "development" }), true);
  assert.equal(isLocalAuthEnvironment({ APP_ENV: "test", ORBITA_ENV: "local" }), true);
  assert.equal(isLocalAuthEnvironment({ APP_ENV: "production", ORBITA_ENV: "development" }), false);
  assert.equal(isLocalAuthEnvironment({ APP_ENV: "development", ORBITA_ENV: "production" }), false);
  assert.equal(isLocalAuthEnvironment({ APP_ENV: "production" }), false);
  assert.equal(isLocalAuthEnvironment({}), false);
  assert.equal(shouldUseSecureSessionCookie({ APP_ENV: "development" }, "http://127.0.0.1:3000"), false);
  assert.equal(shouldUseSecureSessionCookie({ APP_ENV: "development" }, "https://local.example.test"), true);
  assert.equal(shouldUseSecureSessionCookie({ APP_ENV: "production" }, "http://app.internal"), true);
  assert.equal(shouldUseSecureSessionCookie({ APP_ENV: "development", ORBITA_ENV: "production" }, "http://app.internal"), true);
  assert.equal(shouldUseSecureSessionCookie({}, "http://app.internal"), true);
});

test("one-time auth links keep tokens in the fragment", () => {
  const link = new URL(buildAuthActionUrl("https://orbita.example", "verify", "token_abc"));
  assert.equal(link.pathname, "/auth");
  assert.equal(link.search, "?mode=verify");
  assert.equal(link.hash, "#token=token_abc");

  const invite = new URL(buildAuthActionUrl("https://orbita.example", "register", "invite_abc"));
  assert.equal(invite.hash, "#invite_token=invite_abc");
});
