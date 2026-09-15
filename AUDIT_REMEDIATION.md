# ORBITA—30 audit remediation record

Date: 2026-09-15  
Scope: attached ORBITA-30 remediation audit and production/pilot readiness review  
Decision: technical closed-pilot gate is ready after the verification commands below; public paid launch and validated claims remain blocked by explicit external gates.

## Invariants preserved

- `lib/item-bank.ts` was not rewritten. The source still contains exactly Q001–Q300, unique IDs and the original taxonomy/text.
- The existing Next/Vinext + Cloudflare Sites architecture, logical bindings `DB`/`BUCKET`, owner-private deployment and ChatGPT identity boundary remain in place.
- Changes are additive or versioned. Score/report snapshots are normalized at read boundaries so an older stored snapshot cannot leak deprecated display fields.

## P0 remediation matrix

| Area | Implementation | Verification/evidence | Status |
|---|---|---|---|
| Norm/scoring safety | `NormProvider`, `ScoringProvider`, `normStatus=unvalidated`, bounded pilot profile index, uncertainty range, new version IDs | unit contract; methodology UI; report/PDF wording scan | CLOSED |
| AI report safety | versioned `lib/interpretation-library.ts`; minimized payload; strict schema; canonical approved semantics; deterministic fallback | unit report contract; provider code path | CLOSED |
| Adaptive safety | selector `0.3`; priority/expected-information payload; boundary signals; exact reason-code enum; server whitelist; no duplicates/answered/max 3 | adaptive unit contract; backend validation | CLOSED |
| Response quality | modal-frequency straight-line check; exploratory too-fast threshold; pilot RQI; Q243/Q246/Q249/Q250 research-only markers | quality unit contract; methodology text | CLOSED |
| Payment integrity | hosted Stripe Checkout; backend catalog amount/currency; signed webhook; exact event/order/session/metadata/payment-status checks; replay hash/idempotency; paid non-downgrade | payment/signature unit contracts; D1 migration 0006 | CLOSED |
| Retention | `worker/index.ts` scheduled handler and `0 2 * * *`; no active states; bounded dry-run; R2-first deletion; D1 cleanup; transaction records retained; pseudonymous audit; idempotent rerun | retention policy unit contract; built worker marker; internal endpoint | CLOSED |
| Legal/privacy | full versioned Privacy/Terms data model and pages; env-driven operator/contact/jurisdiction/purposes/categories/retention/processors/cross-border/rights/export/delete/security/research/marketing fields; explicit Kazakhstan review gate | `lib/legal-documents.ts`; `/privacy`; `/terms`; `.env.example` | CODE CLOSED / LEGAL APPROVAL OPEN |

## P1 remediation matrix

| Area | Implementation | Status |
|---|---|---|
| Approved interpretation library | Separate versioned module with trait fields, exact overuse/development content, supported combinations and unsupported-combination rejection | CLOSED |
| Structured PDF | JSON-driven 24-page A4 output with top five, full 30, six domains, combinations, teamwork/communication, thinking/execution/influence, self-management/stress/blind spots, plan, methodology and limits; no percentile | CLOSED |
| Test/CI | Unit contracts, payment/adaptive/report/privacy/retention coverage, local Worker/D1/R2 E2E smoke, `ci:verify` | CLOSED after final run |
| Reproducibility | lockfile, `npm ci`, clean source packager and `.gitignore` rules for `node_modules`, `dist`, `.next`, `.wrangler`, `.vite`, `.vinext`, OS artifacts | CLOSED |
| Localization | Explicit RU/KZ/EN catalog; RU published; KZ/EN cannot be marked published before translation/back-translation/cognitive/invariance work | CLOSED |
| Pilot analytics | Aggregate-only funnel, provider/fallback, latency, report/PDF and quality summaries; psychometric output is withheld below sample 200 | CLOSED |

## P2 remediation matrix

| Area | Implementation | Status |
|---|---|---|
| Monolith split | API/retry queue in `app/orbita-api.ts`, shared contracts in `app/orbita-view-types.ts`, public/legal views in `app/orbita-public-views.tsx`; root remains the flow controller and composes views | CLOSED FOR MINIMUM SPLIT |
| Internal navigation lint | Top-level navigation uses an anchor helper with `_top`; no `window.location` internal-navigation warning remains | CLOSED |

## Required final gates

Run in a fresh checkout/environment:

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run test:e2e
npm run build
npm run package:source
npm audit --omit=dev --audit-level=high
```

The E2E script applies every checked-in migration to an isolated local D1 state, seeds only a local test entitlement, starts the built custom Worker, verifies catalog/auth/consent, saves Q001–Q250, exercises response replay, completes adaptive questions, validates norm-safe score and approved report, obtains/downloads a signed PDF, checks allowlisted telemetry and exports the account artifact.

## External blockers and launch decisions

The following are intentionally not guessed in source:

1. Business-approved `ASSESSMENT_PRICE_MINOR`.
2. Managed production `STRIPE_SECRET_KEY`.
3. Managed production `STRIPE_WEBHOOK_SECRET`.
4. Operator/legal values and Kazakhstan legal review for the full documents.
5. Independent psychometric/content work: expert review, cognitive interviews, pilot sample, reliability/validity, factor structure, DIF/invariance, norms and cross-validation.
6. Real KZ/EN translations and their validation.

Final release statuses:

```text
READY_FOR_CLOSED_PILOT=YES (technical gate; use only after pilot content/legal approval)
READY_FOR_PUBLIC_PAID_LAUNCH=NO
READY_FOR_VALIDATED_CLAIMS=NO
```

