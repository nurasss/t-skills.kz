/**
 * Teen-отчёт: чистый билдер данных для экрана результатов и PDF.
 * Без выдуманных описаний: только имена/баллы трейтов, топ-5 профессий
 * из каталога, эхо онбординга и версии пайплайна.
 */
import { TEEN_VALUE_FIT_TOP, TEEN_V1_FIX_VERSION_IDS, TEEN_V1_VERSION_IDS, TEEN_V3_VERSION_IDS, TEEN_V4_VERSION_IDS, TEEN_V5_VERSION_IDS, TEEN_VERSION_IDS, type TeenOnboarding, type TeenStage1Totals, type TeenTraitId } from "@/lib/t-skills/teen/taxonomy";
import { normalizeTeenTotal, rankTeenTraitIds } from "@/lib/t-skills/teen/scoring";
import type { TeenCareerScore } from "@/lib/t-skills/teen/matching";
import type { TeenContentBundle } from "@/lib/t-skills/teen/content";

export type TeenTraitResult = {
  traitId: TeenTraitId;
  name: string;
  total: number;
  normalized: number;
};

export type TeenProfessionResult = {
  professionId: string;
  title: string;
  sphere: string;
  klimovType: string;
  education: string;
  description: string;
  totalScore: number;
  traitScore: number;
  valueBonus: number;
  subjectBonus: number;
};

export type TeenReport = {
  versions: typeof TEEN_V5_VERSION_IDS | typeof TEEN_V4_VERSION_IDS | typeof TEEN_V3_VERSION_IDS | typeof TEEN_VERSION_IDS | typeof TEEN_V1_VERSION_IDS | typeof TEEN_V1_FIX_VERSION_IDS;
  contentStatus: string;
  traits: TeenTraitResult[];
  topTraits: TeenTraitResult[];
  careers: TeenProfessionResult[];
  topValues: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
};

export function buildTeenReport(
  content: TeenContentBundle,
  totals: TeenStage1Totals,
  ranked: readonly TeenCareerScore[],
  onboarding: TeenOnboarding | null,
  topCount = 5,
  topTraitCount = 5,
  versions: TeenReport["versions"] = TEEN_V3_VERSION_IDS,
  /** teen-scoring-v3: raw stage-1 sums used to break exact ties. */
  tieBreak?: TeenStage1Totals,
): TeenReport {
  const traits: TeenTraitResult[] = (Object.keys(totals) as TeenTraitId[]).map((traitId) => ({
    traitId,
    name: content.traitNames[traitId] ?? traitId,
    total: totals[traitId],
    normalized: normalizeTeenTotal(totals[traitId]),
  }));
  const order = new Map(rankTeenTraitIds(totals, tieBreak).map((traitId, index) => [traitId, index]));
  traits.sort((a, b) => order.get(a.traitId)! - order.get(b.traitId)!);

  const byId = new Map(content.professions.map((profession) => [profession.id, profession]));
  const careers: TeenProfessionResult[] = ranked.slice(0, topCount).map((entry) => {
    const profession = byId.get(entry.professionId);
    if (!profession) throw new Error(`TEEN_REPORT:profession:${entry.professionId}`);
    return {
      professionId: profession.id,
      title: profession.title,
      sphere: profession.sphere,
      klimovType: profession.klimovType,
      education: profession.education,
      description: profession.description,
      totalScore: entry.totalScore,
      traitScore: entry.traitScore,
      valueBonus: entry.valueBonus,
      subjectBonus: entry.subjectBonus,
    };
  });

  return {
    versions,
    contentStatus: content.status,
    traits,
    topTraits: traits.slice(0, topTraitCount),
    careers,
    topValues: (onboarding?.valueRanking ?? []).slice(0, TEEN_VALUE_FIT_TOP).map((id) => ({ id, name: content.valueNames[id] ?? id })),
    subjects: (onboarding?.subjects ?? []).map((id) => ({ id, name: content.subjectNames[id] ?? id })),
  };
}
