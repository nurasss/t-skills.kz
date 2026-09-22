# T-Skills pairwise pathway

This document records the content-independent implementation of the new
assessment architecture. It does not replace the legacy `orbita30_ru_v1` or
`orbita30_ru_v2` contracts.

## Version boundary

The active T-Skills pathway uses independent IDs from `lib/t-skills/versions.ts`:

```text
assessment       t-skills_pairwise_v1
item bank        t-skills-pairwise-items-v1
trait taxonomy   t-skills-traits-v1
scoring          pairwise-scoring-v1
career catalog   t-skills-career-catalog-v1
career matching  career-matching-v1
adaptive         career-adaptive-v1
adaptive prompt  career-adaptive-prompt-v1
report           t-skills-report-v1
```

The existing `assessments.versions_json` remains the immutable snapshot for
old sessions. New persistence tables are separate for onboarding, career
adaptive questions/answers and career shortlist snapshots.

## Deterministic core

`lib/t-skills/item-bank.ts` validates the production import before it can be
used:

- exactly 75 items;
- exactly 25 taxonomy IDs represented;
- exactly 6 participations per trait;
- unique item IDs;
- no self-pairs;
- known left/right traits and one item-bank version.

`lib/t-skills/scoring.ts` implements `PairwiseScoringV1`:

```text
left contribution  = -signed answer
right contribution =  signed answer
raw score          = -12..+12
```

Ranking is reproducible and versioned: raw score descending, then absolute
preference strength descending, then fixed taxonomy order, then trait ID.
The strategy interface is intentionally replaceable by Bradley–Terry,
Thurstone or another pairwise model without changing the UI/item contract.

## Career layer

`lib/t-skills/career.ts` matches the complete 25-trait vector plus onboarding
context to an approved structured catalog. It never asks an LLM to invent or
score professions. The client-approved v5 item bank is stored in
[`lib/t-skills/v5/approved-item-bank.ts`](../lib/t-skills/v5/approved-item-bank.ts);
the v5 runtime registry remains gated until the complete client-approved bundle
is imported, so no taxonomy or career weights are invented here.

Use the content gate to validate a supplied bundle:

```sh
npm run content:t-skills:check -- ./path/to/t-skills-content.json
```

Onboarding requires only age, education level and favorite subjects. The
removed basic-values block is rejected by the contract.

## Adaptive career quiz

`lib/t-skills/adaptive.ts` is a separate career signal layer. It validates
strict A/B/C/D questions, machine-readable career signals, age constraints,
duplicate prevention and prohibited content. It supports an AI provider, then
falls back to an approved deterministic question bank. The bounded controller
supports 5–8 questions and early stopping; adaptive answers do not mutate the
25-trait ranking.

The adaptive context contains an age band, education level, favorite subjects,
trait results and candidate shortlist. It intentionally does not contain name,
email, phone or account ID.

## Report boundary

`lib/t-skills/report-contract.ts` builds a report payload from server-owned
trait results and career candidates. LLM personalization is accepted only as
narrative fields; ranks, raw scores, profession scores and ordering are not
replaceable. Ranks 16–25 are labelled `less-expressed`, not weaknesses, and
absolute career claims are rejected.

## Pending client inputs

The following are intentionally not guessed in this repository:

1. the approved list and definitions of 25 traits;
2. the profession catalog, trait profiles and career dimensions;
3. the final adaptive question bank and approved signal mappings.

The pairwise item bank and taxonomy used by `t-skills_pairwise_v1` are already
versioned in the repository. The remaining client-controlled inputs are the
career catalog, its trait profiles/dimensions and any future replacement
clarification bank; the registry and admin publish flow keep those inputs
fail-closed until approved content is imported. The historical Core60/Mercury
path remains available only for its own immutable snapshots and cannot silently
replace the active T-Skills scoring model.
