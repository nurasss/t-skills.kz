import type { ReportJSON, ScoreProfile } from "@/lib/assessment-engine";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";

function traitCode(value: string) {
  return value as unknown as ReportJSON["topStrengths"][number]["trait"];
}

/** Deterministic narrative fallback for the new 25-trait pathway. */
export function buildTSkillsReport(profile: ScoreProfile, adaptiveQuestionCount: number): ReportJSON {
  const top = profile.traits.slice(0, 5);
  const topNames = top.map((trait) => trait.name).join(", ");
  const topStrengths = top.map((trait) => ({
    trait: traitCode(trait.code),
    contribution: `${trait.name} занимает ${trait.rank}-е место в вашем текущем профиле и может чаще проявляться в подходящих условиях.`,
    manifestations: [
      "Вы можете опираться на это качество в учебных и проектных задачах.",
      "Полезно проверять его проявление на конкретных действиях, а не только по самоощущению.",
    ],
    bestConditions: ["Понятная задача с возможностью выбрать подходящий способ работы."],
    overuseRisk: "Даже выраженное качество не работает одинаково хорошо во всех ситуациях; учитывайте контекст и обратную связь.",
    developmentActions: ["Выберите один небольшой проект, где это качество можно наблюдать.", "После проекта запишите, что помогло и что потребовало поддержки."],
  }));
  const sourceKeys = {
    executiveSummary: ["t-skills.pairwise.summary"],
    topStrengths: topStrengths.map((strength) => ({ trait: strength.trait, keys: ["t-skills.pairwise.trait"] })),
    combinations: ["t-skills.pairwise.combinations"],
    teamwork: ["t-skills.pairwise.teamwork"],
    thinkingStyle: ["t-skills.pairwise.thinking"],
    executionStyle: ["t-skills.pairwise.execution"],
    influenceStyle: ["t-skills.pairwise.influence"],
    collaborationStyle: ["t-skills.pairwise.collaboration"],
    selfManagementStyle: ["t-skills.pairwise.self-management"],
    communicationStyle: ["t-skills.pairwise.communication"],
    decisionStyle: ["t-skills.pairwise.decision"],
    stressAndBlindSpots: ["t-skills.pairwise.stress"],
    workEnvironments: ["t-skills.pairwise.environments"],
    development30Days: ["t-skills.pairwise.development"],
    confidenceNote: ["t-skills.pairwise.confidence"],
  } satisfies ReportJSON["sourceKeys"];
  return {
    assessmentVersion: T_SKILLS_VERSION_IDS.assessment,
    coreQuestionCount: 67,
    adaptiveQuestionCount,
    adaptiveProvider: "approved-fallback",
    adaptiveFallbackUsed: true,
    adaptiveVersion: T_SKILLS_VERSION_IDS.adaptive,
    reportVersion: T_SKILLS_VERSION_IDS.report,
    interpretationLibraryVersion: "t-skills-pairwise-v1",
    executiveSummary: `Ваш текущий профиль строится вокруг сочетания качеств: ${topNames}. Это развивающий срез, который лучше проверять небольшими карьерными и учебными экспериментами.`,
    topStrengths,
    combinations: [{ title: "Сочетание ведущих качеств", text: `В работе могут одновременно проявляться ${topNames}. Смотрите, какие условия помогают этому сочетанию приносить пользу.` }],
    teamwork: {
      gives: "Вы можете вносить вклад через свои ведущие качества и ясные договорённости.",
      needs: "Полезно заранее уточнять роли, критерии результата и способ обратной связи.",
    },
    thinkingStyle: "Профиль показывает относительное соотношение 25 качеств, а не единственный стиль мышления.",
    executionStyle: "Действия лучше оценивать по реальным проектам, срокам и полученному результату.",
    influenceStyle: "Влияние может проявляться через объяснение, координацию, аргументы или личный пример.",
    collaborationStyle: "Согласуйте с командой, какие части задачи вы берёте на себя и какая поддержка нужна.",
    selfManagementStyle: "Небольшие наблюдаемые эксперименты помогут проверить результат в разных условиях.",
    communicationStyle: "Выбирайте формат общения по задаче и собеседнику, а не по одному числу профиля.",
    decisionStyle: "Сопоставляйте несколько вариантов и заранее определяйте, по какому сигналу стоит изменить решение.",
    stressAndBlindSpots: "Позиции 16–25 — менее выраженные качества в ipsative-рейтинге, а не автоматически слабости или дефициты.",
    workEnvironments: ["Среда с понятной задачей и возможностью получать обратную связь.", "Проекты, где можно проверять гипотезы небольшими шагами."],
    development30Days: ["Выберите небольшой проект и зафиксируйте, какие качества проявлялись.", "Поговорите с человеком, который видел вашу работу, и сравните наблюдения.", "Запишите один следующий карьерный эксперимент."],
    confidenceNote: "Это детерминированный рабочий срез по 67 парным сравнениям. Он не является диагнозом, прогнозом или абсолютным карьерным решением.",
    sourceKeys,
  };
}
