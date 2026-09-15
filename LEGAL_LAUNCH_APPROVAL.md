# ORBITA-30 Legal Launch Approval

## Status: OPEN — no signed external approval is present

This file is a control record, not a legal approval. It was written to prevent an AI agent from fabricating a lawyer, legal entity, Kazakhstan sign-off, refund policy, trademark review or approved document versions. A responsible operator/legal reviewer must replace the open fields and attach or reference the signed record before any pilot/public gate that requires it.

| Gate | Required evidence | Current status |
|---|---|---|
| LEG-01 Privacy | Approved privacy notice, operator/entity, purposes, categories, processors, cross-border and rights | OPEN; runtime config contains review placeholders |
| LEG-02 Terms | Approved Terms for the actual jurisdiction and product flow | OPEN |
| LEG-03 Refund | Business/legal approved refund and dispute policy consistent with Stripe operations | OPEN; code records states but invents no consumer right |
| LEG-04 Research consent | Approved pilot wording, optional research/marketing separation and withdrawal process | OPEN; versioned consent code exists |
| LEG-05 Similarity/IP | Independent similarity, naming, trademark and content/IP review | OPEN |
| LEG-06 Kazakhstan | Written KZ legal/privacy review and responsible approver | OPEN |

## Documents currently implemented in code

- Privacy/terms pages are served from `app/privacy/page.tsx`, `app/terms/page.tsx` and `lib/legal-documents.ts`.
- Consent decisions are stored independently with `CONSENT_TEXT_VERSION = privacy-2026-09`.
- The product is explicitly original developmental scope and does not claim to implement Gallup/CliftonStrengths®, diagnose, predict employability or provide validated population percentiles.
- `normStatus=unvalidated` and unpublished `kk`/EN routes prevent unsupported claims in this release.

## Approval record to be completed by the operator

```text
Legal reviewer / responsible approver: NOT PROVIDED
Entity and contact: NOT PROVIDED
Jurisdiction: NOT PROVIDED
Approved privacy version: NOT PROVIDED
Approved terms version: NOT PROVIDED
Approved refund version: NOT PROVIDED
KZ sign-off reference/date: NOT PROVIDED
Similarity/IP review reference/date: NOT PROVIDED
```

Until this record is complete, `READY_FOR_CLOSED_PILOT` and `READY_FOR_PUBLIC_PAID_LAUNCH` remain `NO`.
