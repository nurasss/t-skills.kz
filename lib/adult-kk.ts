/**
 * Казахский оверлей взрослого банка (DRAFT-UNREVIEWED).
 * Только DISPLAY-тексты: id/коды/веса не меняются, скоринг идёт по RU-банку.
 * Полный kk-coring требует публикации локали (см. lib/i18n.ts) — пока kk
 * работает на уровне отображения вопросов; отчёт/имена шкал — RU.
 */
import type { AssessmentItem } from "@/app/orbita-view-types";
import type { PairwiseItem } from "@/lib/t-skills/contracts";
import bundle from "@/lib/adult-kk.json";

type AdultKkBundle = {
  status: string;
  pairs: Record<string, { left: string; right: string }>;
  fallback: Record<string, { a: string; b: string }>;
  fallbackPrompt: string;
  legacyTraits: Record<string, { name: string; definition: string; overuseRisk: string }>;
};

const KK = bundle as unknown as AdultKkBundle;

export function adultKkStatus(): string {
  return KK.status;
}

function isPairwise(item: AssessmentItem): item is PairwiseItem {
  return "leftText" in item && "rightText" in item && "leftTraitId" in item;
}

/** Подмена текстов парного вопроса (id TS001..TS067) на казахские. */
export function localizePairwiseItem<T extends AssessmentItem>(item: T, lang: "ru" | "kk"): T {
  if (lang !== "kk" || !isPairwise(item)) return item;
  const kk = KK.pairs["id" in item ? String((item as { id: string }).id) : ""];
  if (!kk) return item;
  return { ...item, leftText: kk.left, rightText: kk.right };
}

/** Подмена текстов фолбэк-уточнения (FB-NN) и его промпта. */
export function localizeAdaptiveItem<T extends AssessmentItem>(item: T, lang: "ru" | "kk"): T {
  if (lang !== "kk") return item;
  const id = "questionId" in item ? String((item as { questionId: string }).questionId) : "";
  const match = /^FB-(\d+)$/.exec(id);
  if (!match) return item;
  const kk = KK.fallback[String(Number(match[1]) - 1)];
  const anyItem = item as unknown as {
    prompt?: string;
    options?: Array<{ id: string; text: string }>;
  };
  if (!kk || !Array.isArray(anyItem.options) || anyItem.options.length < 2) return item;
  return {
    ...item,
    prompt: KK.fallbackPrompt,
    options: anyItem.options.map((option, index) =>
      index === 0 ? { ...option, text: kk.a } : index === 1 ? { ...option, text: kk.b } : option,
    ),
  } as unknown as T;
}

export function localizeAssessmentItem<T extends AssessmentItem>(item: T, lang: "ru" | "kk"): T {
  return localizeAdaptiveItem(localizePairwiseItem(item, lang), lang);
}

/** Казахские имя/определение/риск legacy-трейта для approved library. */
export function legacyTraitKk(code: string): { name: string; definition: string; overuseRisk: string } | null {
  return KK.legacyTraits[code] ?? null;
}
