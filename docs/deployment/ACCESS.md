# Cloudflare Access policy

Create one self-hosted Access application per `workers.dev` hostname. Both applications deny anonymous traffic.

Allow policies:

- owner email;
- explicit beta tester email allowlist;
- environment-specific CI service token.

Do not reuse the staging service token in production. The Worker sets `AUTH_PROVIDER=cloudflare-access`; `worker/index.ts` strips spoofable identity headers and reconstructs the internal identity from Cloudflare `ctx.access`. Application routes never trust `user_id`, email or identity headers supplied by client input.

Verification:

1. unauthenticated `/api/health` does not return 2xx;
2. owner and allowlisted tester can enter;
3. a non-allowlisted identity is blocked at Access;
4. CI service token reaches `/api/health` and observes payments off, AI off and `normStatus=unvalidated`;
5. two human identities verify cross-user 404/401 behavior for session, report, PDF and export.

Anonymous production is a separate future decision and is not part of closed beta.
