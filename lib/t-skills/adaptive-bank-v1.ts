import type { AdaptiveQuestion } from "@/lib/t-skills/contracts";

/**
 * Deterministic safety net for the career layer. It is deliberately separate
 * from the static trait bank: these questions collect career preferences and
 * never alter the 25-trait score.
 */
export const T_SKILLS_ADAPTIVE_BANK_V1: readonly AdaptiveQuestion[] = [
  {
    id: "TS-A01",
    prompt: "В новом проекте какая часть работы вам была бы интереснее всего?",
    dimension: "analysis",
    options: [
      { id: "A", text: "Разобраться, как устроена система и где в ней закономерности", signals: [{ dimension: "systems", value: 1 }, { dimension: "analysis", value: 1 }] },
      { id: "B", text: "Понять, что важно людям, которые будут пользоваться результатом", signals: [{ dimension: "people", value: 1 }, { dimension: "communication", value: 0.7 }] },
      { id: "C", text: "Придумать несколько необычных вариантов решения", signals: [{ dimension: "creativity", value: 1 }, { dimension: "autonomy", value: 0.5 }] },
      { id: "D", text: "Собрать понятный план и последовательно его выполнить", signals: [{ dimension: "structure", value: 1 }, { dimension: "projectScale", value: 0.5 }] },
    ],
  },
  {
    id: "TS-A02",
    prompt: "Когда нужно выбрать направление для проекта, что вы скорее сделаете сначала?",
    dimension: "uncertainty",
    options: [
      { id: "A", text: "Сравню несколько возможных последствий и сценариев", signals: [{ dimension: "analysis", value: 1 }, { dimension: "uncertainty", value: -0.5 }] },
      { id: "B", text: "Обсужу варианты с теми, кого решение затронет", signals: [{ dimension: "people", value: 0.8 }, { dimension: "communication", value: 1 }] },
      { id: "C", text: "Выберу наиболее перспективную гипотезу и проверю её небольшим шагом", signals: [{ dimension: "uncertainty", value: 0.8 }, { dimension: "autonomy", value: 0.6 }] },
      { id: "D", text: "Определю критерии выбора и порядок действий", signals: [{ dimension: "structure", value: 1 }, { dimension: "systems", value: 0.5 }] },
    ],
  },
  {
    id: "TS-A03",
    prompt: "В командной задаче какой способ работы кажется вам наиболее естественным?",
    dimension: "people",
    options: [
      { id: "A", text: "Самостоятельно взять отдельную часть и отвечать за неё", signals: [{ dimension: "autonomy", value: 1 }, { dimension: "structure", value: 0.5 }] },
      { id: "B", text: "Помочь участникам договориться о совместном плане", signals: [{ dimension: "people", value: 0.8 }, { dimension: "communication", value: 1 }] },
      { id: "C", text: "Предложить общий замысел и направить движение команды", signals: [{ dimension: "leadership", value: 1 }, { dimension: "projectScale", value: 0.6 }] },
      { id: "D", text: "Проверить, чтобы этапы и договорённости не потерялись", signals: [{ dimension: "structure", value: 1 }, { dimension: "systems", value: 0.5 }] },
    ],
  },
  {
    id: "TS-A04",
    prompt: "Если условия проекта неожиданно изменились, что вам ближе?",
    dimension: "uncertainty",
    options: [
      { id: "A", text: "Быстро перестроить план и попробовать новый способ", signals: [{ dimension: "uncertainty", value: 1 }, { dimension: "autonomy", value: 0.6 }] },
      { id: "B", text: "Собрать дополнительную информацию, чтобы понять изменение", signals: [{ dimension: "analysis", value: 1 }, { dimension: "systems", value: 0.6 }] },
      { id: "C", text: "Сохранить рабочий ритм и выполнять ближайшие шаги", signals: [{ dimension: "structure", value: 0.8 }, { dimension: "projectScale", value: 0.5 }] },
      { id: "D", text: "Обсудить с командой, как лучше распределить новые задачи", signals: [{ dimension: "people", value: 1 }, { dimension: "communication", value: 0.8 }] },
    ],
  },
  {
    id: "TS-A05",
    prompt: "Какой результат работы вам интереснее показать другим?",
    dimension: "communication",
    options: [
      { id: "A", text: "Понятное объяснение, которое помогает принять решение", signals: [{ dimension: "communication", value: 1 }, { dimension: "people", value: 0.7 }] },
      { id: "B", text: "Исследование с выводами и хорошо проверенными основаниями", signals: [{ dimension: "analysis", value: 1 }, { dimension: "systems", value: 0.7 }] },
      { id: "C", text: "Наглядную концепцию, которую можно развивать дальше", signals: [{ dimension: "creativity", value: 1 }, { dimension: "projectScale", value: 0.6 }] },
      { id: "D", text: "Рабочий результат, которым можно пользоваться уже сейчас", signals: [{ dimension: "structure", value: 0.7 }, { dimension: "autonomy", value: 0.7 }] },
    ],
  },
  {
    id: "TS-A06",
    prompt: "Какой масштаб задачи скорее мотивирует вас продолжать работу?",
    dimension: "projectScale",
    options: [
      { id: "A", text: "Небольшая задача, где можно быстро увидеть эффект своих действий", signals: [{ dimension: "autonomy", value: 0.8 }, { dimension: "structure", value: 0.6 }] },
      { id: "B", text: "Большой проект, где нужно связать несколько частей в целое", signals: [{ dimension: "projectScale", value: 1 }, { dimension: "systems", value: 0.8 }] },
      { id: "C", text: "Задача, где нужно объединить усилия разных людей", signals: [{ dimension: "people", value: 0.9 }, { dimension: "leadership", value: 0.8 }] },
      { id: "D", text: "Открытая задача, где результат можно заметно переосмыслить", signals: [{ dimension: "creativity", value: 1 }, { dimension: "uncertainty", value: 0.7 }] },
    ],
  },
  {
    id: "TS-A07",
    prompt: "Если у вас есть несколько часов на улучшение проекта, что вы выберете?",
    dimension: "structure",
    options: [
      { id: "A", text: "Уточню детали, которые могут повлиять на качество", signals: [{ dimension: "analysis", value: 0.8 }, { dimension: "structure", value: 0.7 }] },
      { id: "B", text: "Попробую другой подход и сравню результат", signals: [{ dimension: "creativity", value: 0.9 }, { dimension: "uncertainty", value: 0.7 }] },
      { id: "C", text: "Упрощу последовательность действий для будущей работы", signals: [{ dimension: "structure", value: 1 }, { dimension: "systems", value: 0.6 }] },
      { id: "D", text: "Проверю, насколько результат понятен и полезен другим", signals: [{ dimension: "people", value: 0.8 }, { dimension: "communication", value: 0.9 }] },
    ],
  },
  {
    id: "TS-A08",
    prompt: "В ситуации разногласий какой результат разговора для вас наиболее ценен?",
    dimension: "people",
    options: [
      { id: "A", text: "Участники лучше понимают интересы и ограничения друг друга", signals: [{ dimension: "people", value: 1 }, { dimension: "communication", value: 0.8 }] },
      { id: "B", text: "Появляется ясное решение и следующий шаг", signals: [{ dimension: "leadership", value: 0.8 }, { dimension: "structure", value: 0.8 }] },
      { id: "C", text: "Становится понятнее, как устроена сама проблема", signals: [{ dimension: "analysis", value: 1 }, { dimension: "systems", value: 0.7 }] },
      { id: "D", text: "Появляется новый вариант, которого раньше не рассматривали", signals: [{ dimension: "creativity", value: 1 }, { dimension: "uncertainty", value: 0.5 }] },
    ],
  },
];
