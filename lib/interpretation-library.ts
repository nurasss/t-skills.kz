import { TRAITS, type TraitCode } from "@/lib/item-bank";

/**
 * Versioned, reviewed semantic source for the report layer.
 *
 * This library deliberately contains no scores and no rank logic. It is the
 * only approved source for trait language; the report provider receives a
 * projection of it and the scoring engine remains the source of truth for all
 * measurement data.
 */
export const INTERPRETATION_LIBRARY_VERSION = "approved-interpretation-v1";

type ApprovedTraitInterpretation = {
  contribution: string;
  manifestations: string[];
  bestConditions: string[];
  overuseRisk: string;
  developmentActions: string[];
};

type ApprovedCombinationInterpretation = {
  left: TraitCode;
  right: TraitCode;
  title: string;
  text: string;
};

const APPROVED_TRAIT_INTERPRETATIONS: Record<TraitCode, ApprovedTraitInterpretation> = Object.fromEntries(
  TRAITS.map((trait) => [
    trait.code,
    {
      contribution: `Может поддерживать ${trait.definition.toLowerCase()}`,
      manifestations: [
        `Вы можете чаще опираться на «${trait.name}», когда нужно действовать в реальном контексте.`,
        "Режим заметнее там, где есть пространство для собственного способа действия и обратная связь по результату.",
      ],
      bestConditions: [
        "понятная цель и право выбирать способ движения",
        "обратная связь по наблюдаемому результату, а не оценка личности",
      ],
      overuseRisk: trait.overuseRisk,
      developmentActions: [
        `Перед важным решением назвать, как «${trait.name}» помогает задаче и где может замедлить её.`,
        "Попросить коллегу описать наблюдаемое поведение, а не давать общую оценку.",
      ],
    } satisfies ApprovedTraitInterpretation,
  ]),
) as Record<TraitCode, ApprovedTraitInterpretation>;

// These are deliberately neutral, evidence-compatible pair statements. A
// pair not listed here is not assigned a psychological property by the report.
const APPROVED_PAIR_INTERPRETATIONS: Array<[TraitCode, TraitCode, string, string]> = [
  ["T01", "T02", "Система + проверка", "Можно удерживать общую картину и одновременно отделять наблюдение от предположения."],
  ["T03", "T07", "Сценарий + эксперимент", "Можно соединять взгляд вперёд с небольшими проверками, чтобы получать новую информацию."],
  ["T06", "T10", "Варианты + практичность", "Можно расширять поле решений и искать рабочую форму при ограниченных ресурсах."],
  ["T11", "T13", "Ответственность + завершение", "Можно связывать личное владение результатом с последовательным закрытием обязательств."],
  ["T12", "T15", "Фокус + структура", "Можно защищать приоритет и превращать его в понятный рабочий процесс."],
  ["T16", "T18", "Старт + выбор", "Можно переводить обсуждение в первый шаг и вовремя фиксировать направление."],
  ["T17", "T19", "Ясность + мобилизация", "Можно делать идею понятной и поддерживать общий ритм движения."],
  ["T20", "T25", "Вызов + напряжение", "Можно поднимать трудный вопрос и возвращать разговор к предмету без лишнего напряжения."],
  ["T21", "T24", "Настройка + индивидуальность", "Можно замечать состояние человека и учитывать его устойчивый стиль взаимодействия."],
  ["T26", "T27", "Самопонимание + баланс", "Можно замечать внутренние реакции и возвращаться к более собранному состоянию."],
  ["T28", "T29", "Восстановление + смысл", "Можно возвращать рабочий ритм и связывать продолжение с более крупной целью."],
  ["T29", "T30", "Смысл + самостоятельность", "Можно сверять выбор с ценностями и сохранять собственный курс в неопределённости."],
];

const APPROVED_COMBINATIONS: Record<string, ApprovedCombinationInterpretation> = Object.fromEntries(
  APPROVED_PAIR_INTERPRETATIONS.map(([left, right, title, text]) => {
    const item = { left: left as TraitCode, right: right as TraitCode, title, text };
    return [[left, right].sort().join("+"), item];
  }),
);

export function getApprovedTraitInterpretation(code: TraitCode) {
  return APPROVED_TRAIT_INTERPRETATIONS[code];
}

export function getApprovedCombination(left: TraitCode, right: TraitCode) {
  return APPROVED_COMBINATIONS[[left, right].sort().join("+")] ?? null;
}

export function approvedLibraryPayload(codes: TraitCode[]) {
  return {
    version: INTERPRETATION_LIBRARY_VERSION,
    traits: codes.map((code) => ({ code, ...getApprovedTraitInterpretation(code) })),
    combinations: codes.flatMap((left, index) => codes.slice(index + 1).map((right) => getApprovedCombination(left, right)).filter(Boolean)),
    unsupportedCombinationPolicy: "Do not infer a trait property; describe only the observable context and invite user reflection.",
  };
}
