# ORBITA-30 v2 Closed Pilot Protocol (Draft for approval)

Status: protocol shell only. It is not evidence that a pilot has run. A psychometric lead and legal/content owner must approve the final protocol before recruitment or analysis.

## Purpose and scope

The pilot evaluates the frozen v2 Core60 bank and deterministic `mvp-0.5-core60` scoring as an original developmental instrument. Historical v1 records remain readable but are not mixed into the v2 item analysis. The pilot does not authorize hiring, diagnosis, intelligence, career-determinism or population-percentile claims.

## Cohort and recruitment

- Initial item-analysis minimum: N≥500 complete/usable participants; preferred target 800–1200 for more stable 30-scale structure work.
- Recruit a controlled Russian-language cohort with documented inclusion/exclusion criteria and recruitment source. Do not mix convenience and paid samples without recording source.
- Collect only coarse, justified optional demographics after separate research consent: age band, language and other variables approved by the protocol. Do not collect IIN, exact date of birth or unnecessary sensitive data.
- Split data before analysis into development/validation partitions; freeze the analysis dataset and record exclusions before inspecting outcome results.

## Frozen versions

```text
assessmentVersion = orbita30_ru_v2
itemBankVersion = core60-v1
scoringVersion = mvp-0.5-core60
adaptiveVersion = mercury-generated-0.1
reportVersion = report-0.4
normVersion = unvalidated-v2
provider = inception-labs
model = mercury-2.5
promptVersion = mercury-adaptive-v1
translationVersion = ru-source-v1
```

The v2 Core60 and accepted adaptive snapshots are immutable during an active cohort. The legacy Q001–Q300 text is frozen only for historical v1 cohorts. Any change requires a new content version, cohort split and changelog entry.

## Participant flow and safeguards

1. Show pilot/unvalidated disclosure and separate Terms, Privacy, research and marketing choices.
2. Require Terms and Privacy before answers; research/marketing are optional and never inferred from payment.
3. Deliver exactly 60 fixed Core items, calculate the preliminary profile server-side, then deliver 10–15 newly generated and validated follow-up items or the approved deterministic fallback set.
4. Store server-confirmed responses, response time metadata and idempotency keys; do not use response time as a hidden score penalty.
5. Deliver a developmental report with uncertainty wording and no norm/diagnostic/employment claims.
6. Provide export and deletion routes; monitor fallback, errors, drop-off and retention without exposing raw answers in general analytics.

## Pre-specified analysis outline

- Item distributions, missingness, response time, quality flags, redundancy and forced-choice pair balance.
- Internal consistency/model-based reliability with uncertainty intervals; retest subset if approved.
- EFA/CFA or other factor-structure analysis selected by the psychometric lead based on the mixed Likert/forced-choice design.
- Convergent/discriminant validity against pre-specified external measures only where consented and available.
- Fairness/DIF and measurement invariance across approved language/demographic groups.
- Calibration of score uncertainty and adaptive expected information using the selected model; replace proxy information only after evidence.

## Stop/decision rules

- Pause recruitment for data integrity, consent, security, unexpected harm, or item leakage.
- Do not promote an item/scoring version based only on reliability or a single factor fit index.
- If evidence does not support a claim, remove or narrow the claim and version the model; do not relabel the result as validated.

## Required approvals before start

Psychometric lead, content/expert review owner, cognitive interview owner, privacy/legal approver, recruitment owner, support contact and incident/on-call owner are not yet assigned. Until assigned and signed, this remains a draft and `READY_FOR_CLOSED_PILOT=NO`.
