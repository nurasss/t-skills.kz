# Application authentication policy

The active production boundary is first-party e-mail/password authentication backed by D1:

- `AUTH_PROVIDER=app-password`;
- registration is invite-only by default (`REGISTRATION_MODE=hybrid`, `PUBLIC_SIGNUP_ENABLED=false`);
- passwords are stored as PBKDF2-HMAC-SHA-256 Web Crypto hashes, never as plaintext;
- sessions use opaque, hashed, expiring D1 records and an HttpOnly `__Host-` cookie in production;
- e-mail verification is required before a session is issued;
- state-changing requests require same-origin checks and CSRF validation;
- admin access requires the stored `users.role=admin` or an explicit server-side allowlist.

Cloudflare Access and dispatch-owned ChatGPT identity headers are not active integrations for this application. The Worker strips those headers instead of treating client-supplied identity as authentication. Do not re-enable a header-based provider without a separate security review.

Verification:

1. unauthenticated `/api/account` and protected pages return `401` or redirect to `/auth`;
2. a new account cannot be created without the required legal consents and, by default, an invite;
3. an unverified account cannot log in;
4. login, registration, verification, password-reset and invite endpoints return rate-limit responses after repeated attempts;
5. two authenticated identities verify cross-user `404`/`401` behavior for assessment, report, PDF and export;
6. a non-admin identity cannot access `/admin` or `/api/admin/*`.

Production launch remains blocked until the e-mail sender, D1/R2 bindings, rate-limit secret, legal operator details and an operational incident/recovery process are configured.
