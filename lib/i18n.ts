export const LOCALES = ["ru", "kz", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export type TranslationMetadata = {
  locale: Locale;
  status: "published" | "unpublished";
  sourceVersion: string;
  translationVersion: string | null;
  reviewer: string | null;
  requirements: string[];
};

export const ITEM_TRANSLATION_POLICY: Record<Locale, TranslationMetadata> = {
  ru: {
    locale: "ru",
    status: "published",
    sourceVersion: "draft-pilot-v1",
    translationVersion: "ru-source-v1",
    reviewer: "source-authored",
    requirements: ["content review before closed pilot"],
  },
  kz: {
    locale: "kz",
    status: "unpublished",
    sourceVersion: "draft-pilot-v1",
    translationVersion: null,
    reviewer: null,
    requirements: ["independent translation", "back-translation", "cognitive interviews", "measurement-invariance review"],
  },
  en: {
    locale: "en",
    status: "unpublished",
    sourceVersion: "draft-pilot-v1",
    translationVersion: null,
    reviewer: null,
    requirements: ["independent translation", "back-translation", "cognitive interviews", "measurement-invariance review"],
  },
};

export function resolveLocale(value: string | null | undefined): Locale {
  const normalized = value?.trim().toLowerCase();
  return normalized === "kz" || normalized === "en" ? normalized : "ru";
}

export function itemTranslationMetadata(locale: Locale = "ru") {
  return ITEM_TRANSLATION_POLICY[locale];
}

export function canPublishLocale(locale: Locale) {
  return ITEM_TRANSLATION_POLICY[locale].status === "published";
}
