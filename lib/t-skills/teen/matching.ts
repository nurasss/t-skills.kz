/**
 * Teen career matching: traitScore × weight + бонусы value_fit / subject.
 *
 * Веса профессий знаковые (−1..1): положительный — трейт за профессию,
 * отрицательный — против. Непокрытые трейты дают 0.
 * v2: traitScore приводится к опорной норме весов (× REF / ‖w‖), иначе
 * профессии с большим числом/величиной весов систематически выигрывают.
 * PENDING_METHODOLOGIST: величины бонусов — дефолты, ждёт методолога.
 */
import {
  TEEN_CAREER_REFERENCE_WEIGHT_NORM,
  TEEN_SUBJECT_BONUS,
  TEEN_TRAIT_IDS,
  TEEN_VALUE_FIT_BONUS,
  TEEN_VALUE_FIT_TOP,
  type TeenOnboarding,
  type TeenProfession,
  type TeenStage1Totals,
  type TeenTraitId,
} from "@/lib/t-skills/teen/taxonomy";
import { normalizeTeenTotal } from "@/lib/t-skills/teen/scoring";

export type TeenCareerScore = {
  professionId: string;
  traitScore: number;
  valueBonus: number;
  subjectBonus: number;
  totalScore: number;
};

export const TEEN_CAREER_MATCHING_V2 = "teen-career-matching-v2" as const;

function weightNorm(profession: TeenProfession) {
  return Math.sqrt(Object.values(profession.traitWeights).reduce((sum, weight) => sum + (weight ?? 0) ** 2, 0));
}

export function scoreTeenCareers(
  totals: TeenStage1Totals,
  catalog: readonly TeenProfession[],
  onboarding: TeenOnboarding,
  matchingVersion: string = "teen-career-matching-v1",
): TeenCareerScore[] {
  const normalizeWeights = matchingVersion === TEEN_CAREER_MATCHING_V2;
  const topValues = new Set(onboarding.valueRanking.slice(0, TEEN_VALUE_FIT_TOP));
  const subjects = new Set(onboarding.subjects);
  return catalog
    .filter((profession) => profession.active)
    .map((profession) => {
      let traitScore = 0;
      for (const traitId of TEEN_TRAIT_IDS) {
        const weight = profession.traitWeights[traitId as TeenTraitId] ?? 0;
        if (weight !== 0) traitScore += normalizeTeenTotal(totals[traitId as TeenTraitId]) * weight;
      }
      if (normalizeWeights) {
        const norm = weightNorm(profession);
        traitScore = norm > 0 ? (traitScore * TEEN_CAREER_REFERENCE_WEIGHT_NORM) / norm : 0;
      }
      const valueBonus = profession.valueFit.some((value) => topValues.has(value)) ? TEEN_VALUE_FIT_BONUS : 0;
      const subjectBonus = profession.subjectTags.some((subject) => subjects.has(subject)) ? TEEN_SUBJECT_BONUS : 0;
      const totalScore = traitScore + valueBonus + subjectBonus;
      return { professionId: profession.id, traitScore, valueBonus, subjectBonus, totalScore };
    })
    .sort((a, b) => b.totalScore - a.totalScore || (a.professionId < b.professionId ? -1 : 1));
}

export function topTeenCareers(
  totals: TeenStage1Totals,
  catalog: readonly TeenProfession[],
  onboarding: TeenOnboarding,
  count = 5,
  matchingVersion?: string,
): TeenCareerScore[] {
  return scoreTeenCareers(totals, catalog, onboarding, matchingVersion).slice(0, count);
}
