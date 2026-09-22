# T-Skills Master Specification v5

This repository contains a separate, content-gated implementation of the v5
assessment architecture. It does not rewrite historical Core60/Mercury or the
currently deployed `t-skills_pairwise_v1` sessions.

## What is implemented

The v5 domain is under [`lib/t-skills/v5/`](../lib/t-skills/v5/):

- versioned contracts for the 75-item / 25-trait pathway;
- item-bank validation: 75 items, 25 traits, six exposures, unique IDs and
  unique pairs;
- deterministic base and final scoring with all contributions, mean and
  variance;
- versioned uncertainty scoring and algorithmic selection of prepared
  clarification items (target 6, maximum 7);
- deterministic full-vector career matching, soft subject matching, rules and
  optional prepared career tie-breaks;
- a content-gated deterministic pipeline that runs base scoring, uncertainty,
  prepared clarification, final scoring, career lock and report creation;
- a versioned `t_skills_professions` database table with validated catalog
  load/upsert helpers;
- locked report payload and deterministic narrative/roadmap fallback;
- strict narrative validation so the text layer cannot change scores, ranks,
  professions or roadmap templates.

The v5 persistence migrations are [`drizzle/0017_mysterious_giant_man.sql`](../drizzle/0017_mysterious_giant_man.sql) and [`drizzle/0018_melodic_loki.sql`](../drizzle/0018_melodic_loki.sql) (the latter adds the structured profession catalog table).
The v5 rows are included in account export, assessment deletion, account
deletion and retention purge paths.

Admins can inspect the calculation chain through the protected endpoint
`GET /api/admin/assessments/{assessmentId}/t-skills-v5`. It returns only the
assessment trace and omits account identity fields.

## Intentionally not invented

The specification requires client-approved product data. The 75 Russian item
texts and pair mapping have now been supplied and are stored in
[`lib/t-skills/v5/approved-item-bank.ts`](../lib/t-skills/v5/approved-item-bank.ts).
The remaining data still required for a complete bundle is:

1. the final 25-trait taxonomy and descriptions;
2. the clarification bank;
3. the profession catalog, trait weights, dimensions and rules;
4. career tie-break questions and roadmap templates.

The item bank is versioned as `t-skills-pairwise-items-v5`, but it is not
activated by the runtime until the complete version-consistent bundle passes
the content gate.

These are not generated or guessed. Until one complete, version-consistent
bundle is supplied, `T_SKILLS_V5_PRODUCTION_CONTENT` remains empty and the
existing production pathway stays unchanged.

## Content gate

Validate a supplied JSON bundle before importing it:

```sh
npm run content:t-skills:v5:check -- ./path/to/t-skills-v5-content.json
```

After review, import the same validated file into the generated registry and
review the resulting diff before a release:

```sh
npm run content:t-skills:v5:import -- ./path/to/t-skills-v5-content.json
```

The importer refuses invalid bundles and writes only the validated, normalized
content module. It does not create or alter product content.

The bundle must contain these independent version fields:

```text
assessmentVersion
traitTaxonomyVersion
itemBankVersion
scoringVersion
uncertaintyVersion
clarificationBankVersion
careerCatalogVersion
careerMatchingVersion
careerTiebreakVersion
narrativePromptVersion
reportVersion
```

The validator rejects incomplete mappings and unsafe structure. In
particular, it will not accept a catalog profession without weights for all 25
traits or a clarification bank that has no trait coverage.

## Runtime boundary

When the approved bundle is available, the intended state sequence is:

```text
PAID → ONBOARDING → BASE_ASSESSMENT → BASE_SCORING → CLARIFICATION
→ FINAL_SCORING → CAREER_MATCHING → [CAREER_TIEBREAK]
→ NARRATIVE_GENERATION → COMPLETED
```

The numerical profile and career ranking are server-owned. AI, if enabled,
receives only approved results and writes narrative text. If AI is unavailable,
the deterministic fallback still produces the report payload.

## Verification

Relevant local checks:

```sh
npx tsc --noEmit
npm run lint
npm test
npm run db:check
```

The existing v4/legacy flow must be tested separately until the v5 content
gate is passed and a migration/release decision is approved.
