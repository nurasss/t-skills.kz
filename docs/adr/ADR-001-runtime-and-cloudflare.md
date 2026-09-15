# ADR-001: Runtime and Cloudflare architecture

- Status: Accepted for pilot
- Date: 2026-09-15
- Owners: ORBITA engineering

## Context

ORBITA-30 is a stateful paid assessment. It needs durable transactional records, private report artifacts, scheduled retention, signed downloads, and one deployable edge boundary. The existing implementation already runs on Next-compatible Vinext in a Cloudflare Worker with D1 and R2. Replacing this stack during hardening would combine a platform migration with changes to scoring, payments, and retention.

## Decision

Keep the current architecture for the pilot and pin its runtime and dependencies exactly.

- D1 is the system of record for users, orders, entitlements, sessions, responses, reports, audit events, and purge jobs. Its SQL constraints and migrations make payment and assessment state inspectable and recoverable.
- R2 stores generated PDF artifacts. Database rows store ownership and object keys; short-lived owner-bound tokens gate downloads.
- One Cloudflare Worker owns the HTTP security boundary, request IDs, the Next/Vinext handler, D1/R2 bindings, and the scheduled retention handler.
- Next supplies the application model and routing. Vinext is the current Cloudflare adapter because it preserves the working application while producing a Worker-native bundle.

## Consequences and known risks

Vinext is not treated as a production-stable compatibility guarantee. Framework updates can change rendering, CSP nonce propagation, route classification, or generated Worker behavior. D1 has different concurrency and transaction semantics from a conventional regional database. Local Wrangler performance is not production capacity evidence. R2 and D1 require separate restore and disaster-recovery procedures.

The risk is controlled by exact dependency/runtime pins, golden scoring fixtures, browser hydration/CSP regression, D1/R2 E2E tests, migration drift checks, backup/restore drills, exact-Git release packaging, and a release manifest tied to one commit.

## Migration triggers

Start a separate migration project if any of these is observed in staging or production:

- a reproducible Vinext incompatibility blocks a security or correctness fix;
- supported Next APIs needed by ORBITA cannot be implemented without adapter patches;
- measured D1 contention prevents the agreed SLO after query/index remediation;
- Cloudflare changes the support status of a required primitive;
- the regression suite fails on an otherwise mandatory runtime upgrade.

Candidate targets must be evaluated against the complete E2E, CSP, scoring, payment, PDF, retention, and restore suites. A migration is not bundled into an ordinary feature release.

## Rollback strategy

Every deployment is tied to a source Git SHA, lockfile hash, migration set, and immutable package hash. Roll back application code to the last verified Worker artifact. Database migrations are forward-compatible by default; destructive schema changes require an explicit data migration, backup, and tested compensating migration. Preserve R2 objects until the database rollback and report ownership checks are verified. If a runtime upgrade fails, restore the pinned Node/Vinext versions and rebuild from the recorded source commit.

## Rejected alternatives

- Calling Vinext “stable” without upstream evidence: rejected as unverifiable.
- Migrating platform and business logic together: rejected because it expands blast radius and invalidates comparison evidence.
- Moving PDFs into D1: rejected because binary artifacts and relational state have different lifecycle and access needs.
