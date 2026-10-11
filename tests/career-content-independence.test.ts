import assert from "node:assert/strict";
import test from "node:test";

import { matchCareers } from "@/lib/t-skills/career";
import {
  productionCareerCatalog,
  productionCareerModel,
  T_SKILLS_PRODUCTION_CAREER_CONTENT,
} from "@/lib/t-skills/production-career-model";
import { T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import type { OnboardingContext } from "@/lib/t-skills/contracts";

// P2.21 — career content/model separation at the pure seam.
//
// Matching weights live in the immutable MODEL_PROFILES registry
// (lib/t-skills/production-career-model.ts); titles, descriptions and tags are
// CMS-editable editorial copy. These tests prove copy edits cannot move
// rankings. Determinism of the full pipeline is covered in
// tests/t-skills.test.ts; the byte-identical assertion below pins it for the
// production catalog end to end.

function variedTraits() {
  return T_SKILLS_WORKING_TAXONOMY.map((trait, index) => ({
    traitId: trait.id,
    rawScore: (index % 11) - 5,
    normalizedScore: (((index * 37) % 200) - 100) / 100,
    rank: index + 1,
    strengthOfPreference: 1,
    strongPositiveCount: 1,
    positiveCount: 1,
    exposure: 5,
  }));
}

const onboarding: OnboardingContext = {
  age: 18,
  educationLevel: "university",
  favoriteSubjects: ["математика", "информатика"],
};

function rankingSignature(candidates: ReturnType<typeof matchCareers>) {
  return candidates.map((candidate) => ({
    professionId: candidate.professionId,
    traitMatch: candidate.traitMatch,
    subjectMatch: candidate.subjectMatch,
    adaptiveMatch: candidate.adaptiveMatch,
    totalScore: candidate.totalScore,
    rank: candidate.rank,
  }));
}

test("published content edits (titles/descriptions) do not change matching weights", () => {
  const traits = variedTraits();
  const catalog = productionCareerCatalog();
  const editedCatalog = catalog.map((profession) => ({
    ...profession,
    title: `EDITED ${profession.id}`,
    description: "Edited editorial copy that must never influence scoring.",
  }));
  const questions = [
    {
      id: "content-check",
      options: [
        { id: "A" as const, text: "systems", signals: [{ dimension: "systems" as const, value: 1 }] },
        { id: "B" as const, text: "people", signals: [{ dimension: "people" as const, value: 1 }] },
        { id: "C" as const, text: "creative", signals: [{ dimension: "creativity" as const, value: 1 }] },
        { id: "D" as const, text: "plan", signals: [{ dimension: "structure" as const, value: 1 }] },
      ],
    },
  ];
  const answers = [{ questionId: "content-check", optionId: "A" as const }];
  assert.deepEqual(
    rankingSignature(matchCareers({ traits, onboarding, catalog: editedCatalog })),
    rankingSignature(matchCareers({ traits, onboarding, catalog })),
  );
  assert.deepEqual(
    rankingSignature(matchCareers({ traits, onboarding, catalog: editedCatalog, adaptiveQuestions: questions, adaptiveAnswers: answers })),
    rankingSignature(matchCareers({ traits, onboarding, catalog, adaptiveQuestions: questions, adaptiveAnswers: answers })),
  );
});

test("model weights contain no editorial copy and are version-pinned", () => {
  const model = productionCareerModel(T_SKILLS_VERSION_IDS.careerMatching);
  assert.ok(model);
  const serialized = JSON.stringify(model);
  for (const entry of T_SKILLS_PRODUCTION_CAREER_CONTENT) {
    assert.equal(serialized.includes(entry.title), false);
    assert.equal(serialized.includes(entry.titleKk), false);
  }
  assert.deepEqual(model, productionCareerModel(T_SKILLS_VERSION_IDS.careerMatching));
  assert.equal(productionCareerModel("career-matching-v999"), null);
});

test("same input with the same versions produces a byte-identical result", () => {
  const traits = variedTraits();
  const catalog = productionCareerCatalog();
  const first = matchCareers({ traits, onboarding, catalog, limit: 20 });
  const second = matchCareers({ traits: structuredClone(traits), onboarding: structuredClone(onboarding), catalog: structuredClone(catalog), limit: 20 });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.length, Math.min(20, catalog.length));
});
