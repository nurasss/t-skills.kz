/**
 * Версионированный реестр каталогов профессий Teen (подготовка подключения).
 *
 * Поиск профессии и её перевода — строго по паре
 * (careerCatalogVersion, professionId):
 * - "t-skills-teen-careers-v1" → content.v2.json (170, боевой каталог);
 * - "t-skills-teen-careers-v2" → content.careers-v2.json (111, staged).
 *
 * Старые результаты продолжают использовать каталог 170: дефолт всех
 * функций — v1, боевые вызовы версию не передают. Публикация v2
 * заблокирована до завершения перевода KK p036 (см. careers-v3.i18n.json):
 * isTeenCareerCatalogPublishable("...-v2") === false, assert бросает
 * TEEN_CAREER_CATALOG_BLOCKED. Никаких изменений runtime-дефолтов,
 * versions.ts и миграций здесь нет.
 */
import { parseTeenContentBundle, type TeenContentBundle } from "@/lib/t-skills/teen/content";
import type { TeenRuntimeLocale } from "@/lib/t-skills/teen/runtime";
import { teenVersionIdsForAssessment } from "@/lib/t-skills/versions";
import bundleV1Ru from "@/lib/t-skills/teen/content.v2.json";
import bundleV1Kk from "@/lib/t-skills/teen/content.v2.kk.json";
import bundleV2Ru from "@/lib/t-skills/teen/content.careers-v2.json";
import bundleV2Kk from "@/lib/t-skills/teen/content.careers-v2.kk.json";
import i18nStatus from "@/lib/t-skills/teen/careers-v3.i18n.json";

export const TEEN_CAREER_CATALOG_V1 = "t-skills-teen-careers-v1" as const;
export const TEEN_CAREER_CATALOG_V2 = "t-skills-teen-careers-v2" as const;

export type TeenCareerCatalogVersion = typeof TEEN_CAREER_CATALOG_V1 | typeof TEEN_CAREER_CATALOG_V2;

type TeenProfessionEntry = TeenContentBundle["professions"][number];

const BUNDLES: Record<string, Record<TeenRuntimeLocale, TeenContentBundle>> = {
  [TEEN_CAREER_CATALOG_V1]: {
    ru: parseTeenContentBundle(bundleV1Ru),
    kk: parseTeenContentBundle(bundleV1Kk),
  },
  [TEEN_CAREER_CATALOG_V2]: {
    ru: parseTeenContentBundle(bundleV2Ru),
    kk: parseTeenContentBundle(bundleV2Kk),
  },
};

/** Профессии каталога для версии и языка; неизвестная версия — ошибка. */
export function teenCareerCatalog(
  careerCatalogVersion: string,
  locale: TeenRuntimeLocale = "ru",
): readonly TeenProfessionEntry[] {
  const bundle = BUNDLES[careerCatalogVersion];
  if (!bundle) throw new Error(`TEEN_CAREER_CATALOG_UNKNOWN:${careerCatalogVersion}`);
  return bundle[locale].professions;
}

/** Одна профессия по (версия каталога, id, язык); нет — null. */
export function teenCareerEntry(
  careerCatalogVersion: string,
  professionId: string,
  locale: TeenRuntimeLocale = "ru",
): TeenProfessionEntry | null {
  return teenCareerCatalog(careerCatalogVersion, locale).find((entry) => entry.id === professionId) ?? null;
}

/** Явные привязки версия оценки → версия каталога (реестр будущей проводки).
 *  Пуст в проде: привязки из констант версий — единственный прод-источник.
 *  Тесты регистрируют здесь тестовые контракты и снимают их после себя. */
const assessmentCatalogBindings = new Map<string, string>();

/** Зарегистрировать привязку версия оценки → версия каталога. */
export function registerTeenCatalogBinding(assessmentVersion: string, careerCatalogVersion: string): void {
  assessmentCatalogBindings.set(assessmentVersion, careerCatalogVersion);
}

/** Снять привязку, зарегистрированную через registerTeenCatalogBinding. */
export function unregisterTeenCatalogBinding(assessmentVersion: string): void {
  assessmentCatalogBindings.delete(assessmentVersion);
}

/**
 * Версия каталога для версии оценки; null — не teen-оценка.
 * Явная привязка и поле контракта возвращаются дословно, даже если такой
 * версии каталога нет в реестре (это проверяет teenPublishBlockReason,
 * а не тихая подмена на v1). v1 подразумевается только при отсутствии поля.
 */
export function teenCareerCatalogVersionForAssessment(assessmentVersion: unknown): string | null {
  if (typeof assessmentVersion === "string" && assessmentCatalogBindings.has(assessmentVersion)) {
    return assessmentCatalogBindings.get(assessmentVersion)!;
  }
  const ids = teenVersionIdsForAssessment(assessmentVersion);
  if (!ids) return null;
  const catalog = (ids as { careerCatalog?: unknown }).careerCatalog;
  return typeof catalog === "string" ? catalog : TEEN_CAREER_CATALOG_V1;
}

/** Причина блокировки публикации версии оценки через каталог, или null. */
export function teenPublishBlockReason(assessmentVersion: unknown): string | null {
  const catalog = teenCareerCatalogVersionForAssessment(assessmentVersion);
  if (catalog === null) return null;
  if (!(catalog in BUNDLES)) return `TEEN_CAREER_CATALOG_UNREGISTERED:${catalog}`;
  if (isTeenCareerCatalogPublishable(catalog)) return null;
  const pending = Object.keys(
    (i18nStatus as { needsTranslation?: Record<string, string[]> }).needsTranslation ?? {},
  );
  return `TEEN_CAREER_CATALOG_BLOCKED:${catalog}:${pending.join(",")}`;
}
/** Можно ли публиковать версию каталога (v2 заблокирована до перевода KK p036). */
export function isTeenCareerCatalogPublishable(careerCatalogVersion: string): boolean {
  if (careerCatalogVersion === TEEN_CAREER_CATALOG_V1) return true;
  if (careerCatalogVersion === TEEN_CAREER_CATALOG_V2) {
    return Object.keys((i18nStatus as { needsTranslation?: Record<string, string[]> }).needsTranslation ?? {}).length === 0;
  }
  return false;
}

/**
 * Версия каталога для серверного расчёта по сохранённой сессии.
 * - поле отсутствует (исторические сессии) → подразумевается контракт версии
 *   оценки (v1 для всех существующих teen-версий);
 * - поле явно задано: неизвестная версия — TEEN_CAREER_CATALOG_UNKNOWN,
 *   несовпадение с контрактом — TEEN_CAREER_CATALOG_MISMATCH.
 * Бросает ДО расчёта; результат под чужой версией не сохраняется.
 */
export function teenCatalogVersionForSession(assessmentVersion: unknown, storedVersions: unknown): string {
  const contract = teenCareerCatalogVersionForAssessment(assessmentVersion);
  if (contract === null) throw new Error(`TEEN_CAREER_CATALOG_NO_CONTRACT:${String(assessmentVersion)}`);
  const stored = (storedVersions as { careerCatalog?: unknown } | null | undefined)?.careerCatalog;
  if (stored === undefined || stored === null) return contract;
  if (typeof stored !== "string" || !(stored in BUNDLES)) {
    throw new Error(`TEEN_CAREER_CATALOG_UNKNOWN:${String(stored)}`);
  }
  if (stored !== contract) {
    throw new Error(`TEEN_CAREER_CATALOG_MISMATCH:${String(assessmentVersion)}:${stored}-vs-${contract}`);
  }
  return stored;
}

/** Бросает TEEN_CAREER_CATALOG_BLOCKED, пока публикация запрещена. */
export function assertTeenCareerCatalogPublishable(careerCatalogVersion: string): void {
  if (careerCatalogVersion !== TEEN_CAREER_CATALOG_V2) {
    if (careerCatalogVersion !== TEEN_CAREER_CATALOG_V1) throw new Error(`TEEN_CAREER_CATALOG_UNKNOWN:${careerCatalogVersion}`);
    return;
  }
  const pending = (i18nStatus as { needsTranslation?: Record<string, string[]> }).needsTranslation ?? {};
  if (Object.keys(pending).length > 0) {
    throw new Error(`TEEN_CAREER_CATALOG_BLOCKED:${TEEN_CAREER_CATALOG_V2}:${Object.keys(pending).join(",")}`);
  }
}
