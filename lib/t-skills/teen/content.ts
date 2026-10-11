/**
 * Загрузчик и валидатор бандла teen-контента v1 (scripts/convert-teen-bank.py).
 * Бандл утверждён владельцем (status PUBLISHED, 2026-09-26).
 */
import {
  TEEN_SUBJECTS,
  TEEN_TRAIT_IDS,
  TEEN_VALUES,
  type TeenPairwiseItem,
  type TeenProfession,
  type TeenStage2Question,
  type TeenSubjectId,
  type TeenTraitId,
  type TeenValueId,
} from "@/lib/t-skills/teen/taxonomy";

export type TeenContentBundle = {
  status: string;
  traitNames: Record<TeenTraitId, string>;
  valueNames: Record<TeenValueId, string>;
  subjectNames: Record<TeenSubjectId, string>;
  items75: TeenPairwiseItem[];
  items75Texts: Record<string, { left: string; right: string }>;
  stage2: (TeenStage2Question & { scenario: string; options: { id: string; value: number; text: string }[] })[];
  professions: (TeenProfession & { title: string; sphere: string; klimovType: string; education: string; description: string })[];
};

/**
 * Apply a versioned display-side layout without changing statement text or
 * trait identity. Swapping selected pairs balances each trait at three left
 * and three right exposures in t-skills-teen-items-v2.
 */
export function applyTeenPairSideLayout(bundle: TeenContentBundle, swapQuestionNumbers: readonly number[]): TeenContentBundle {
  const swapIds = new Set(swapQuestionNumbers.map((number) => `t75-${number}`));
  const items75 = bundle.items75.map((item) => swapIds.has(item.id)
    ? { ...item, leftTraitId: item.rightTraitId, rightTraitId: item.leftTraitId }
    : item);
  const items75Texts = Object.fromEntries(Object.entries(bundle.items75Texts).map(([id, texts]) => [
    id,
    swapIds.has(id) ? { left: texts.right, right: texts.left } : texts,
  ]));
  return { ...bundle, items75, items75Texts };
}

function assertInList(value: string, list: readonly string[], what: string): void {
  if (!list.includes(value)) throw new Error(`TEEN_CONTENT:${what}:${value}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTeenContentBundle(raw: any): TeenContentBundle {
  if (!raw || typeof raw !== "object") throw new Error("TEEN_CONTENT:shape");
  const traitIds = new Set<string>(TEEN_TRAIT_IDS);
  const traitNames = {} as Record<TeenTraitId, string>;
  for (const entry of raw.traits ?? []) {
    assertInList(entry.id, TEEN_TRAIT_IDS, "trait");
    traitNames[entry.id as TeenTraitId] = String(entry.ru ?? entry.id);
  }
  if (Object.keys(traitNames).length !== TEEN_TRAIT_IDS.length) throw new Error("TEEN_CONTENT:traits:count");

  const valueNames = {} as Record<TeenValueId, string>;
  for (const entry of raw.values ?? []) {
    assertInList(entry.id, TEEN_VALUES, "value");
    valueNames[entry.id as TeenValueId] = String(entry.ru ?? entry.id);
  }
  const subjectNames = {} as Record<TeenSubjectId, string>;
  for (const entry of raw.subjects ?? []) {
    assertInList(entry.id, TEEN_SUBJECTS, "subject");
    subjectNames[entry.id as TeenSubjectId] = String(entry.ru ?? entry.id);
  }

  const items75: TeenPairwiseItem[] = [];
  const items75Texts: Record<string, { left: string; right: string }> = {};
  for (const item of raw.items75 ?? []) {
    if (!traitIds.has(item.leftTrait) || !traitIds.has(item.rightTrait)) throw new Error(`TEEN_CONTENT:item:${item.n}`);
    const id = `t75-${item.n}`;
    items75.push({ id, leftTraitId: item.leftTrait as TeenTraitId, rightTraitId: item.rightTrait as TeenTraitId });
    items75Texts[id] = { left: String(item.leftText ?? ""), right: String(item.rightText ?? "") };
  }
  if (items75.length !== 75) throw new Error("TEEN_CONTENT:items75:count");

  const stage2 = (raw.stage2 ?? []).map((question: { trait: string; scenario: string; options: { id: string; value: number; text: string }[] }, index: number) => {
    if (!traitIds.has(question.trait)) throw new Error(`TEEN_CONTENT:stage2:${index}`);
    const options = (question.options ?? []).map((option) => {
      if (![-2, -1, 1, 2].includes(option.value)) throw new Error(`TEEN_CONTENT:stage2:option:${option.id}`);
      return { id: String(option.id), value: option.value, text: String(option.text ?? "") };
    });
    if (options.length !== 4) throw new Error(`TEEN_CONTENT:stage2:options:${question.trait}`);
    return { id: `t2-${question.trait}`, traitId: question.trait as TeenTraitId, scenario: String(question.scenario ?? ""), options };
  });

  const professions = (raw.professions ?? []).map((entry: {
    id: string; title: string; sphere: string; klimovType: string; education: string; description: string;
    traitWeights: Record<string, number>; subjectTags: string[]; valueFit: string[];
  }) => {
    const traitWeights: Partial<Record<TeenTraitId, number>> = {};
    for (const [traitId, weight] of Object.entries(entry.traitWeights ?? {})) {
      assertInList(traitId, TEEN_TRAIT_IDS, "weight");
      if (typeof weight !== "number" || weight < -1 || weight > 1) throw new Error(`TEEN_CONTENT:weight:${entry.id}:${traitId}`);
      traitWeights[traitId as TeenTraitId] = weight;
    }
    const subjectTags = (entry.subjectTags ?? []).map((subject) => {
      assertInList(subject, TEEN_SUBJECTS, "subjectTag");
      return subject as TeenSubjectId;
    });
    const valueFit = (entry.valueFit ?? []).map((value) => {
      assertInList(value, TEEN_VALUES, "valueFit");
      return value as TeenValueId;
    });
    return {
      id: String(entry.id), title: String(entry.title ?? ""), sphere: String(entry.sphere ?? ""),
      klimovType: String(entry.klimovType ?? ""), education: String(entry.education ?? ""),
      description: String(entry.description ?? ""), traitWeights, subjectTags, valueFit, active: true,
    };
  });
  if (professions.length === 0) throw new Error("TEEN_CONTENT:professions:empty");

  return { status: String(raw.status ?? "UNKNOWN"), traitNames, valueNames, subjectNames, items75, items75Texts, stage2, professions };
}
