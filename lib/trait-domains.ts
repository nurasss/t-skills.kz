/**
 * Единое сопоставление качество → домен → цвет.
 *
 * Утверждённая группировка 25 качеств рабочей таксономии T-Skills:
 * D1 — осмысление и анализ, D2 — создание и адаптация, D3 — исполнение
 * и качество, D4 — влияние и движение, D5 — связи и сотрудничество,
 * D6 — самоуправление и устойчивость.
 *
 * Правила:
 * - цвет зависит только от стабильного ID качества (не от позиции, ранга
 *   или языка; локализованные названия для сопоставления не используются);
 * - все качества одного домена имеют один доменный цвет;
 * - палитра переиспользует существующие sage/blue/amber/coral/rose/lavender;
 * - скоринг и карьерные веса здесь не затрагиваются — только отображение.
 *
 * Исторические коды T01–T30 (legacy/Core60) маппятся через V2_DOMAINS из
 * lib/v2-item-bank.ts — имена доменов там совпадают с утверждёнными.
 * Teen-таблица (25 качеств текущего 75-вопросного теста) внесена дословно
 * по утверждённому распределению владельца и применяется только в
 * teen-контексте. ID без утверждённого домена получают нейтральный slate —
 * тоже константу, не зависящую от позиции.
 */
import { V2_DOMAINS } from "@/lib/v2-item-bank";
import { isTSkillsTeenVersion, T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";

export const DOMAIN_CODES = ["D1", "D2", "D3", "D4", "D5", "D6"] as const;

export type DomainCode = (typeof DOMAIN_CODES)[number];

/**
 * Контекст таксономии обязателен: один и тот же ID в разных таксономиях
 * может лежать в разных доменах (например, persistence — D6 во взрослой
 * таблице и D3 в Teen-таблице), поэтому общий поиск с приоритетом
 * взрослой таблицы неверен.
 */
export type TraitTaxonomy = "adult" | "teen" | "legacy";

/** Таксономия по версии оценки; неизвестные версии считаются взрослыми. */
export function taxonomyForAssessmentVersion(assessmentVersion: string): TraitTaxonomy {
  if (isTSkillsTeenVersion(assessmentVersion)) return "teen";
  if (assessmentVersion === T_SKILLS_VERSION_IDS.assessment) return "adult";
  return "legacy";
}

export type DomainColorKey = "sage" | "blue" | "amber" | "coral" | "rose" | "lavender";

/** Нейтральный цвет для качеств без утверждённого домена. */
export const FALLBACK_COLOR_KEY = "slate" as const;

export type TraitColorKey = DomainColorKey | typeof FALLBACK_COLOR_KEY;

const DOMAIN_META: Record<DomainCode, { name: string; colorKey: DomainColorKey; hex: string }> = {
  D1: { name: "Осмысление и анализ", colorKey: "sage", hex: "#8FA888" },
  D2: { name: "Создание и адаптация", colorKey: "blue", hex: "#7C93A8" },
  D3: { name: "Исполнение и качество", colorKey: "amber", hex: "#C79A5B" },
  D4: { name: "Влияние и движение", colorKey: "coral", hex: "#C1836F" },
  D5: { name: "Связи и сотрудничество", colorKey: "rose", hex: "#B78D97" },
  D6: { name: "Самоуправление и устойчивость", colorKey: "lavender", hex: "#9B93B5" },
};

const FALLBACK_HEX = "#8A8F98";

/** Утверждённая группировка 25 качеств рабочей таксономии (нули — номера 01–25). */
const ADULT_TRAIT_DOMAINS: Record<string, DomainCode> = {
  analytical: "D1",
  strategic: "D1",
  curiosity: "D1",
  observation: "D1",
  "systems-thinking": "D1",
  creativity: "D2",
  adaptability: "D2",
  "risk-tolerance": "D2",
  learning: "D2",
  practicality: "D2",
  discipline: "D3",
  "attention-to-detail": "D3",
  organization: "D3",
  planning: "D3",
  leadership: "D4",
  initiative: "D4",
  persuasion: "D4",
  decisiveness: "D4",
  communication: "D5",
  empathy: "D5",
  teamwork: "D5",
  independence: "D6",
  persistence: "D6",
  responsibility: "D6",
  "stress-resilience": "D6",
};

const LEGACY_TRAIT_DOMAINS: Record<string, DomainCode> = Object.fromEntries(
  V2_DOMAINS.flatMap((domain) =>
    (domain.traits as readonly string[]).map((trait) => [trait, domain.code as DomainCode]),
  ),
);

/**
 * Утверждённая группировка 25 качеств текущего 75-вопросного (Teen-)теста,
 * дословно по таблице владельца (D1:5, D2:4, D3:4, D4:3, D5:6, D6:3).
 * persistence здесь — D3 («Упорство»); во взрослой таблице persistence — D6.
 */
const TEEN_TRAIT_DOMAINS: Record<string, DomainCode> = {
  curiosity: "D1",
  "strategic-thinking": "D1",
  "analytical-interest": "D1",
  "data-systemizing": "D1",
  "technical-interest": "D1",
  innovativeness: "D2",
  "aesthetic-sense": "D2",
  "creative-expression": "D2",
  adaptability: "D2",
  discipline: "D3",
  "result-orientation": "D3",
  organizer: "D3",
  persistence: "D3",
  leadership: "D4",
  energizer: "D4",
  "entrepreneurial-drive": "D4",
  communicator: "D5",
  networker: "D5",
  empathy: "D5",
  harmonizer: "D5",
  "team-player": "D5",
  reliability: "D5",
  "stress-resilience": "D6",
  composure: "D6",
  autonomy: "D6",
};

/** Домен качества по стабильному ID в заданной таксономии или null. */
export function domainOfTraitId(traitId: string, taxonomy: TraitTaxonomy): DomainCode | null {
  if (taxonomy === "adult") return ADULT_TRAIT_DOMAINS[traitId] ?? null;
  if (taxonomy === "teen") return TEEN_TRAIT_DOMAINS[traitId] ?? null;
  return LEGACY_TRAIT_DOMAINS[traitId] ?? null;
}

/** Русское название домена (для легенд) или null. */
export function domainName(code: DomainCode): string {
  return DOMAIN_META[code].name;
}

/** Ключ CSS-класса (ov-tag-*) по ID качества в таксономии; фолбэк — slate. */
export function traitDomainColorKey(traitId: string, taxonomy: TraitTaxonomy): TraitColorKey {
  const domain = domainOfTraitId(traitId, taxonomy);
  return domain ? DOMAIN_META[domain].colorKey : FALLBACK_COLOR_KEY;
}

/** HEX заливки по ID качества в таксономии; фолбэк — нейтральный серый. */
export function traitDomainHex(traitId: string, taxonomy: TraitTaxonomy): string {
  const domain = domainOfTraitId(traitId, taxonomy);
  return domain ? DOMAIN_META[domain].hex : FALLBACK_HEX;
}

/** HEX нейтрального фолбэка (диаграммы без утверждённого домена). */
export function fallbackDomainHex(): string {
  return FALLBACK_HEX;
}
