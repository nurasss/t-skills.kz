import { z } from "zod";

const shortText = (max: number, min = 1) => z.string().trim().min(min).max(max);
const optionalShortText = (max: number) => z.string().trim().min(1).max(max).optional();

const faqItemSchema = z.object({
  q: shortText(300),
  a: shortText(2000),
}).strict();

const statTuple = z.tuple([shortText(120), shortText(300)]);

/** CMS payload that landing merges over static defaults. Strict: unknown fields rejected. */
export const HomepageCmsSchema = z.object({
  heroPre: optionalShortText(500),
  heroAccent: optionalShortText(200),
  heroPost: optionalShortText(200),
  heroLede: optionalShortText(2000),
  heroMeta: optionalShortText(500),
  cta: optionalShortText(200),
  finalH2: optionalShortText(500),
  finalP: optionalShortText(2000),
  stats: z.array(statTuple).max(8).optional(),
  faqItems: z.array(faqItemSchema).max(20).optional(),
}).strict();

export const FaqCmsSchema = z.object({
  title: shortText(500),
  items: z.array(faqItemSchema).min(1).max(50),
}).strict();

export const SeoCmsSchema = z.object({
  title: shortText(200),
  description: shortText(500),
  canonical: z.string().trim().max(500).optional(),
  ogTitle: optionalShortText(200),
  ogDescription: optionalShortText(500),
}).strict();

/** Legacy/secondary keys referenced by REQUIRED_CONTENT_FIELDS. */
export const HomepageHeroCmsSchema = z.object({
  title: shortText(500),
  subtitle: shortText(2000),
  cta: shortText(200),
}).strict();

export const PricingCmsSchema = z.object({
  visiblePrice: shortText(200),
  explanatoryCopy: shortText(2000),
}).strict();

export const CMS_SCHEMAS: Record<string, z.ZodTypeAny> = {
  homepage: HomepageCmsSchema,
  faq: FaqCmsSchema,
  seo: SeoCmsSchema,
  "homepage.hero": HomepageHeroCmsSchema,
  pricing: PricingCmsSchema,
};

export function cmsSchemaFor(contentKey: string): z.ZodTypeAny | null {
  return CMS_SCHEMAS[contentKey] ?? null;
}

export function validateCmsPayload(contentKey: string, payload: unknown): { ok: true } | { ok: false; issues: z.ZodIssue[] } {
  const schema = cmsSchemaFor(contentKey);
  if (!schema) return { ok: false, issues: [{ code: z.ZodIssueCode.custom, path: ["content_key"], message: `Unsupported content_key: ${contentKey}.` } as z.ZodIssue] };
  const result = schema.safeParse(payload);
  return result.success ? { ok: true } : { ok: false, issues: result.error.issues };
}

export type PublicContentItem = {
  contentKey: string;
  locale: string;
  publishedVersion: number | null;
  published: unknown;
  publishedAt: number | null;
};

const FORBIDDEN_PUBLIC_KEYS = ["draft", "draft_payload", "draftStatus", "currentVersion", "unpublished"] as const;

/** Project a DB row to the public representation. Never exposes draft state. */
export function toPublicContentItem(row: {
  content_key: unknown;
  locale: unknown;
  published_version: unknown;
  published_payload_json: unknown;
  published_at: unknown;
}): PublicContentItem {
  let published: unknown = null;
  try {
    published = typeof row.published_payload_json === "string" ? JSON.parse(row.published_payload_json) : null;
  } catch {
    published = null;
  }
  return {
    contentKey: String(row.content_key ?? ""),
    locale: String(row.locale ?? ""),
    publishedVersion: typeof row.published_version === "number" ? row.published_version : null,
    published,
    publishedAt: typeof row.published_at === "number" ? row.published_at : null,
  };
}

export function assertNoDraftLeak(value: unknown): void {
  const serialized = JSON.stringify(value ?? null);
  for (const key of FORBIDDEN_PUBLIC_KEYS) {
    if (serialized.includes(`"${key}"`)) throw new Error(`PUBLIC_CMS_LEAK:${key}`);
  }
}
