"use client";

import { useEffect, useMemo, useState } from "react";

import { LANDING_KK } from "@/app/landing/content-kk";
import { LANDING_RU } from "@/app/landing/content";
import { validateCmsPayload } from "@/lib/cms-schemas";

import { apiJson, display, formatDate, ConfirmAction, Panel, StatusPill } from "./ui-kit";
import styles from "./admin-console.module.css";

/**
 * P2.9 + P2.10 + P2.11 — CMS Studio.
 *
 * Structured (non-JSON) editors for homepage / faq / seo drafts, a static
 * preview merged over hardcoded landing defaults (never published), and a
 * version history / compare view backed by
 * GET /api/admin/content/[key]/versions.
 *
 * Editing requires `content.edit`, publishing requires `content.publish`.
 * Client-side schema feedback comes from validateCmsPayload; the server
 * remains the source of truth (CMS_SCHEMA_VALIDATION_FAILED on save/publish).
 */

type Locale = "ru" | "kk";
type TabKey = "homepage" | "faq" | "seo";

type ContentEntry = {
  contentKey: string;
  locale: string;
  currentVersion: number | null;
  publishedVersion: number | null;
  updatedAt: number | null;
  draft: Record<string, unknown> | null;
  published: Record<string, unknown> | null;
  draftStatus: string | null;
  publishedStatus: string | null;
};

type VersionEntry = {
  contentKey: string;
  locale: string;
  version: number;
  status: string;
  createdBy: string | null;
  createdAt: number;
  publishedBy: string | null;
  publishedAt: number | null;
  payload: Record<string, unknown> | null;
};

type QaItem = { q: string; a: string };
type StatItem = { num: string; label: string };

type HomepageForm = {
  heroPre: string;
  heroAccent: string;
  heroPost: string;
  heroLede: string;
  heroMeta: string;
  cta: string;
  finalH2: string;
  finalP: string;
  stats: StatItem[];
  faqItems: QaItem[];
};

type FaqForm = { title: string; items: QaItem[] };

type SeoForm = {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
};

const TAB_LABELS: Record<TabKey, string> = { homepage: "Главная страница", faq: "FAQ", seo: "SEO" };

const HOMEPAGE_TEXT_FIELDS: { key: keyof Omit<HomepageForm, "stats" | "faqItems">; label: string; multiline?: boolean }[] = [
  { key: "heroPre", label: "Подзаголовок hero" },
  { key: "heroAccent", label: "Акцент hero" },
  { key: "heroPost", label: "Заголовок hero (после акцента)" },
  { key: "heroLede", label: "Описание hero", multiline: true },
  { key: "heroMeta", label: "Мета-текст hero" },
  { key: "cta", label: "Текст кнопки" },
  { key: "finalH2", label: "Финальный призыв — заголовок" },
  { key: "finalP", label: "Финальный призыв — текст", multiline: true },
];

const SEO_FIELDS: { key: keyof SeoForm; label: string; multiline?: boolean }[] = [
  { key: "title", label: "Мета-заголовок (обязательно)" },
  { key: "description", label: "Мета-описание (обязательно)", multiline: true },
  { key: "canonical", label: "Канонический URL (необязательно)" },
  { key: "ogTitle", label: "OG-заголовок (необязательно)" },
  { key: "ogDescription", label: "OG-описание (необязательно)", multiline: true },
];

/** Hardcoded fallback defaults mirroring app/landing/content.ts (RU) / content-kk.ts. */
const LANDING_DEFAULTS = { ru: LANDING_RU, kk: LANDING_KK } as const;

const SEO_FALLBACK: Record<Locale, { title: string; description: string; canonical: string; ogTitle: string; ogDescription: string }> = {
  ru: {
    title: "T-Skills — поймите, в чём вы действительно сильны",
    description: LANDING_RU.heroLede,
    canonical: "",
    ogTitle: "T-Skills — профиль сильных сторон",
    ogDescription: LANDING_RU.heroLede,
  },
  kk: {
    title: "T-Skills — шын мәнінде немен мықты екеніңізді түсініңіз",
    description: LANDING_KK.heroLede,
    canonical: "",
    ogTitle: "T-Skills — мықты жақтар бейіні",
    ogDescription: LANDING_KK.heroLede,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function qaListOf(value: unknown): QaItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({ q: asString(item.q), a: asString(item.a) }));
}

function statsOf(value: unknown): StatItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is [unknown, unknown] => Array.isArray(item))
    .map((item) => ({ num: asString(item[0]), label: asString(item[1]) }));
}

function emptyHomepageForm(): HomepageForm {
  return { heroPre: "", heroAccent: "", heroPost: "", heroLede: "", heroMeta: "", cta: "", finalH2: "", finalP: "", stats: [], faqItems: [] };
}

function homepageFormOf(payload: Record<string, unknown>): HomepageForm {
  return {
    heroPre: asString(payload.heroPre),
    heroAccent: asString(payload.heroAccent),
    heroPost: asString(payload.heroPost),
    heroLede: asString(payload.heroLede),
    heroMeta: asString(payload.heroMeta),
    cta: asString(payload.cta),
    finalH2: asString(payload.finalH2),
    finalP: asString(payload.finalP),
    stats: statsOf(payload.stats),
    faqItems: qaListOf(payload.faqItems),
  };
}

function faqFormOf(payload: Record<string, unknown>): FaqForm {
  return { title: asString(payload.title), items: qaListOf(payload.items) };
}

function seoFormOf(payload: Record<string, unknown>): SeoForm {
  return {
    title: asString(payload.title),
    description: asString(payload.description),
    canonical: asString(payload.canonical),
    ogTitle: asString(payload.ogTitle),
    ogDescription: asString(payload.ogDescription),
  };
}

function setNonEmpty(target: Record<string, unknown>, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) target[key] = trimmed;
}

function buildHomepagePayload(form: HomepageForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  setNonEmpty(payload, "heroPre", form.heroPre);
  setNonEmpty(payload, "heroAccent", form.heroAccent);
  setNonEmpty(payload, "heroPost", form.heroPost);
  setNonEmpty(payload, "heroLede", form.heroLede);
  setNonEmpty(payload, "heroMeta", form.heroMeta);
  setNonEmpty(payload, "cta", form.cta);
  setNonEmpty(payload, "finalH2", form.finalH2);
  setNonEmpty(payload, "finalP", form.finalP);
  const stats = form.stats
    .map((item) => [item.num.trim(), item.label.trim()] as [string, string])
    .filter(([num, label]) => num && label);
  if (stats.length) payload.stats = stats;
  const faqItems = form.faqItems
    .map((item) => ({ q: item.q.trim(), a: item.a.trim() }))
    .filter((item) => item.q && item.a);
  if (faqItems.length) payload.faqItems = faqItems;
  return payload;
}

function buildFaqPayload(form: FaqForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  setNonEmpty(payload, "title", form.title);
  payload.items = form.items
    .map((item) => ({ q: item.q.trim(), a: item.a.trim() }))
    .filter((item) => item.q && item.a);
  return payload;
}

function buildSeoPayload(form: SeoForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  setNonEmpty(payload, "title", form.title);
  setNonEmpty(payload, "description", form.description);
  setNonEmpty(payload, "canonical", form.canonical);
  setNonEmpty(payload, "ogTitle", form.ogTitle);
  setNonEmpty(payload, "ogDescription", form.ogDescription);
  return payload;
}

/** Flatten a payload to dotted field paths for version comparison. */
function flattenPayload(value: unknown, prefix: string, out: Map<string, unknown>) {
  if (Array.isArray(value)) {
    if (!value.length && prefix) out.set(prefix, value);
    value.forEach((item, index) => flattenPayload(item, `${prefix}[${index}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length && prefix) out.set(prefix, value);
    for (const [key, item] of entries) flattenPayload(item, prefix ? `${prefix}.${key}` : key, out);
    return;
  }
  out.set(prefix, value);
}

type DiffRow = { path: string; oldText: string; newText: string };

function diffPayloads(oldPayload: unknown, newPayload: unknown): DiffRow[] {
  const oldFlat = new Map<string, unknown>();
  const newFlat = new Map<string, unknown>();
  flattenPayload(oldPayload ?? {}, "", oldFlat);
  flattenPayload(newPayload ?? {}, "", newFlat);
  const paths = new Set([...oldFlat.keys(), ...newFlat.keys()]);
  const rows: DiffRow[] = [];
  for (const path of [...paths].sort()) {
    const oldValue = oldFlat.has(path) ? JSON.stringify(oldFlat.get(path)) : "—";
    const newValue = newFlat.has(path) ? JSON.stringify(newFlat.get(path)) : "—";
    if (oldValue !== newValue) rows.push({ path: path || "(root)", oldText: oldValue, newText: newValue });
  }
  return rows;
}

function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  if (item === undefined) return next;
  next.splice(target, 0, item);
  return next;
}

export function CmsStudio({ permissions }: { permissions: string[] }) {
  const [tab, setTab] = useState<TabKey>("homepage");
  const [locale, setLocale] = useState<Locale>("ru");
  const canEdit = permissions.includes("content.edit");
  const canPublish = permissions.includes("content.publish");

  return (
    <div className={styles.stack}>
      <Panel
        title="CMS Studio"
        eyebrow="Контент"
        action={
          <div className={styles.actionRow}>
            {(["ru", "kk"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={option === locale ? styles.primaryButton : styles.secondaryButton}
                onClick={() => setLocale(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        }
      >
        <div className={styles.actionRow} role="tablist" aria-label="Ключи контента">
          {(["homepage", "faq", "seo"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? styles.primaryButton : styles.secondaryButton}
              onClick={() => setTab(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
        {!canEdit ? (
          <p className={styles.notice}>Только чтение: у вашей роли есть content.read, но нет content.edit. Редактирование и публикация отключены.</p>
        ) : null}
      </Panel>
      <ContentTab key={`${tab}:${locale}`} contentKey={tab} locale={locale} canEdit={canEdit} canPublish={canPublish} />
    </div>
  );
}

function ContentTab({ contentKey, locale, canEdit, canPublish }: { contentKey: TabKey; locale: Locale; canEdit: boolean; canPublish: boolean }) {
  const [entry, setEntry] = useState<ContentEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const [homepageForm, setHomepageForm] = useState<HomepageForm>(emptyHomepageForm);
  const [faqForm, setFaqForm] = useState<FaqForm>({ title: "", items: [] });
  const [seoForm, setSeoForm] = useState<SeoForm>({ title: "", description: "", canonical: "", ogTitle: "", ogDescription: "" });
  const [formDirty, setFormDirty] = useState(false);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [publishReason, setPublishReason] = useState("");
  const [publishBusy, setPublishBusy] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedText, setAdvancedText] = useState("");
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setLoadError(null);
    setRevision((value) => value + 1);
  };

  useEffect(() => {
    let active = true;
    void apiJson<{ data: ContentEntry[] }>(`/api/admin/content?content_key=${encodeURIComponent(contentKey)}&locale=${encodeURIComponent(locale)}`)
      .then((result) => {
        if (!active) return;
        const found = (result.data ?? []).find((row) => row.contentKey === contentKey) ?? null;
        setEntry(found);
        const source = asRecord(found?.draft ?? found?.published);
        if (contentKey === "homepage") setHomepageForm(homepageFormOf(source));
        if (contentKey === "faq") setFaqForm(faqFormOf(source));
        if (contentKey === "seo") setSeoForm(seoFormOf(source));
        setFormDirty(false);
        setSaveNotice(null);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadError(reason instanceof Error ? reason.message : "Не удалось загрузить контент.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contentKey, locale, revision]);

  const payload = useMemo<Record<string, unknown>>(() => {
    if (contentKey === "homepage") return buildHomepagePayload(homepageForm);
    if (contentKey === "faq") return buildFaqPayload(faqForm);
    return buildSeoPayload(seoForm);
  }, [contentKey, homepageForm, faqForm, seoForm]);

  const validationIssues = useMemo(() => {
    const result = validateCmsPayload(contentKey, payload);
    return result.ok ? [] : result.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }, [contentKey, payload]);

  function toggleAdvanced() {
    if (!advancedOpen) setAdvancedText(JSON.stringify(payload, null, 2));
    setAdvancedOpen((value) => !value);
  }

  async function saveDraft() {
    setSaveBusy(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const body: Record<string, unknown> = {
        content_key: contentKey,
        locale,
        payload,
        expected_version: entry?.currentVersion ?? 0,
      };
      const saved = await apiJson<{ version: number; status: string }>(`/api/admin/content`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSaveNotice(`Черновик сохранён как v${saved.version} (${saved.status}). Не опубликовано.`);
      refresh();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Не удалось сохранить черновик.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function publishDraft(reason: string) {
    if (entry?.currentVersion === null || entry?.currentVersion === undefined) return;
    setPublishBusy(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = { locale, version: entry.currentVersion };
      if (reason.trim()) body.reason = reason.trim();
      await apiJson(`/api/admin/content/${encodeURIComponent(contentKey)}/publish`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSaveNotice(`Опубликовано v${entry.currentVersion}.`);
      setShowPublishConfirm(false);
      setPublishReason("");
      refresh();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Не удалось опубликовать.");
    } finally {
      setPublishBusy(false);
    }
  }

  function applyAdvancedJson() {
    setAdvancedError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(advancedText) as unknown;
    } catch {
      setAdvancedError("Некорректный JSON: не удалось разобрать.");
      return;
    }
    const result = validateCmsPayload(contentKey, parsed);
    if (!result.ok) {
      setAdvancedError(result.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join(" | "));
      return;
    }
    const record = asRecord(parsed);
    if (contentKey === "homepage") setHomepageForm(homepageFormOf(record));
    if (contentKey === "faq") setFaqForm(faqFormOf(record));
    if (contentKey === "seo") setSeoForm(seoFormOf(record));
    setFormDirty(true);
    setSaveNotice("Расширенный JSON применён к структурированной форме. Проверьте, затем сохраните черновик.");
  }

  if (loading) {
    return (
      <Panel title={`${TAB_LABELS[contentKey]} · ${locale.toUpperCase()}`} eyebrow="CMS Studio">
        <p className={styles.actionHint}>Загрузка…</p>
      </Panel>
    );
  }

  if (loadError) {
    return (
      <Panel title={`${TAB_LABELS[contentKey]} · ${locale.toUpperCase()}`} eyebrow="CMS Studio">
        <p className={styles.error}>{loadError}</p>
        <button type="button" className={styles.secondaryButton} onClick={refresh}>
          Повторить
        </button>
      </Panel>
    );
  }

  const draftVersion = entry?.currentVersion ?? null;
  const publishedVersion = entry?.publishedVersion ?? null;
  const isNew = draftVersion === null;

  return (
    <div className={styles.stack}>
      <Panel
        title={`${TAB_LABELS[contentKey]} · ${locale.toUpperCase()}`}
        eyebrow="CMS Studio — структурированный редактор"
        action={
          <span className={styles.actionHint}>
            черновик <strong>{draftVersion === null ? "—" : `v${draftVersion}`}</strong>
            {" · опубликовано "}
            <strong>{publishedVersion === null ? "—" : `v${publishedVersion}`}</strong>
            {formDirty ? " · несохранённые изменения" : ""}
          </span>
        }
      >
        {isNew ? <p className={styles.notice}>Для этого ключа и локали черновика пока нет. Заполните форму и сохраните черновик.</p> : null}
        {contentKey === "homepage" ? (
          <HomepageEditor form={homepageForm} disabled={!canEdit} onChange={(next) => { setHomepageForm(next); setFormDirty(true); }} />
        ) : null}
        {contentKey === "faq" ? (
          <div className={styles.editor}>
            <label><span>Заголовок FAQ</span><input value={faqForm.title} disabled={!canEdit} maxLength={500} onChange={(event) => { setFaqForm({ ...faqForm, title: event.target.value }); setFormDirty(true); }} /></label>
            <QaListEditor title="Элементы FAQ" items={faqForm.items} disabled={!canEdit} max={50} onChange={(items) => { setFaqForm({ ...faqForm, items }); setFormDirty(true); }} />
          </div>
        ) : null}
        {contentKey === "seo" ? (
          <SeoEditor form={seoForm} disabled={!canEdit} onChange={(next) => { setSeoForm(next); setFormDirty(true); }} />
        ) : null}

        {validationIssues.length ? (
          <div>
            <p className={styles.actionHint}>Замечания схемы (проверка на клиенте; сервер проверяет повторно при сохранении):</p>
            <ul>
              {validationIssues.map((issue) => (
                <li key={issue} className={styles.error} style={{ marginBottom: 4 }}>
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={styles.notice}>Проверка схемы пройдена для текущей формы.</p>
        )}

        {saveError ? <p className={styles.error}>{saveError}</p> : null}
        {saveNotice ? <p className={styles.notice}>{saveNotice}</p> : null}

        <div className={styles.actionRow}>
          <button type="button" className={styles.primaryButton} disabled={!canEdit || saveBusy} onClick={saveDraft}>
            {saveBusy ? "Сохранение…" : isNew ? "Сохранить черновик (v1)" : "Сохранить черновик (новая версия)"}
          </button>
          {!canEdit ? <span className={styles.actionHint}>Требуется content.edit</span> : null}
        </div>

        <div className={styles.editor} style={{ marginTop: 16 }}>
          <strong>Опубликовать</strong>
          <p className={styles.actionHint}>
            Публикует текущий черновик {draftVersion === null ? "" : `v${draftVersion}`}. Публикация — отдельный явный шаг: сохранение черновика никогда не публикует.
          </p>
          <input
            placeholder="Причина (необязательно, попадёт в аудит)"
            value={publishReason}
            disabled={!canPublish || draftVersion === null}
            onChange={(event) => setPublishReason(event.target.value)}
            aria-label="Причина публикации (необязательно)"
          />
          {showPublishConfirm ? (
            <ConfirmAction
              action={`Опубликовать ${TAB_LABELS[contentKey]} v${draftVersion}`}
              consequence="Черновик станет опубликованной версией, показываемой посетителям."
              busy={publishBusy}
              error={saveError}
              onCancel={() => setShowPublishConfirm(false)}
              onConfirm={(reason) => {
                void publishDraft(reason);
              }}
            />
          ) : (
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!canPublish || draftVersion === null || publishBusy}
                onClick={() => setShowPublishConfirm(true)}
              >
                Опубликовать {draftVersion === null ? "" : `v${draftVersion}`}
              </button>
              {!canPublish ? <span className={styles.actionHint}>Требуется content.publish</span> : null}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <button type="button" className={styles.secondaryButton} onClick={toggleAdvanced} aria-expanded={advancedOpen}>
            {advancedOpen ? "▾ Скрыть расширенный режим / режим разработчика" : "▸ Показать расширенный режим / режим разработчика"}
          </button>
          {advancedOpen ? (
            <div className={styles.editor} style={{ marginTop: 8, border: "1px dashed #cbd9d0", borderRadius: 9, padding: 12 }}>
              <strong>Расширенный режим / режим разработчика</strong>
              <p className={styles.actionHint}>
                Сырой JSON только для разработчиков. Используйте структурированную форму выше. JSON проверяется по той же схеме, прежде чем будет применён к
                форме.
              </p>
              <textarea
                value={advancedText}
                onChange={(event) => setAdvancedText(event.target.value)}
                rows={12}
                spellCheck={false}
                aria-label="JSON полезной нагрузки (расширенный режим)"
              />
              {advancedError ? <p className={styles.error}>{advancedError}</p> : null}
              <div className={styles.actionRow}>
                <button type="button" className={styles.secondaryButton} disabled={!canEdit} onClick={applyAdvancedJson}>
                  Проверить и применить JSON к форме
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>

      <PreviewPanel contentKey={contentKey} locale={locale} draftPayload={payload} />

      <HistoryPanel contentKey={contentKey} locale={locale} canEdit={canEdit} onRestored={refresh} />
    </div>
  );
}

function HomepageEditor({ form, disabled, onChange }: { form: HomepageForm; disabled: boolean; onChange: (next: HomepageForm) => void }) {
  return (
    <div className={styles.stack}>
      <div className={styles.editor}>
        {HOMEPAGE_TEXT_FIELDS.map((field) => (
          <label key={field.key}>
            <span className={styles.actionHint}>{field.label}</span>
            {field.multiline ? (
              <textarea
                value={form[field.key]}
                disabled={disabled}
                onChange={(event) => onChange({ ...form, [field.key]: event.target.value })}
                rows={3}
              />
            ) : (
              <input
                value={form[field.key]}
                disabled={disabled}
                onChange={(event) => onChange({ ...form, [field.key]: event.target.value })}
              />
            )}
          </label>
        ))}
        <p className={styles.actionHint}>Пустые поля исключаются из полезной нагрузки (лендинг использует значения по умолчанию).</p>
      </div>
      <StatListEditor stats={form.stats} disabled={disabled} onChange={(stats) => onChange({ ...form, stats })} />
      <QaListEditor
        title="Элементы FAQ главной страницы"
        items={form.faqItems}
        disabled={disabled}
        max={20}
        onChange={(faqItems) => onChange({ ...form, faqItems })}
      />
    </div>
  );
}

function StatListEditor({ stats, disabled, onChange }: { stats: StatItem[]; disabled: boolean; onChange: (next: StatItem[]) => void }) {
  return (
    <div className={styles.editor}>
      <strong>Статистика (макс. 8)</strong>
      {stats.length ? (
        stats.map((item, index) => (
          <div key={`stat-${index}`} className={styles.inlineFields}>
            <input
              placeholder="Число (например, 25)"
              value={item.num}
              disabled={disabled}
              aria-label={`Статистика ${index + 1}: число`}
              onChange={(event) => onChange(stats.map((entry, i) => (i === index ? { ...entry, num: event.target.value } : entry)))}
            />
            <input
              placeholder="Подпись"
              value={item.label}
              disabled={disabled}
              aria-label={`Статистика ${index + 1}: подпись`}
              onChange={(event) => onChange(stats.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))}
            />
            <button type="button" className={styles.secondaryButton} disabled={disabled || index === 0} onClick={() => onChange(moveItem(stats, index, -1))} aria-label={`Переместить статистику ${index + 1} вверх`}>
              ↑
            </button>
            <button type="button" className={styles.secondaryButton} disabled={disabled || index === stats.length - 1} onClick={() => onChange(moveItem(stats, index, 1))} aria-label={`Переместить статистику ${index + 1} вниз`}>
              ↓
            </button>
            <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={() => onChange(stats.filter((_, i) => i !== index))}>
              Удалить
            </button>
          </div>
        ))
      ) : (
        <p className={styles.actionHint}>В черновике нет статистики — будут использованы значения по умолчанию.</p>
      )}
      <div className={styles.actionRow}>
        <button type="button" className={styles.secondaryButton} disabled={disabled || stats.length >= 8} onClick={() => onChange([...stats, { num: "", label: "" }])}>
          Добавить статистику
        </button>
      </div>
    </div>
  );
}

function QaListEditor({ title, items, disabled, max, onChange }: { title: string; items: QaItem[]; disabled: boolean; max: number; onChange: (next: QaItem[]) => void }) {
  return (
    <div className={styles.editor}>
      <strong>{title} (макс. {max})</strong>
      {items.length ? (
        items.map((item, index) => (
          <div key={`qa-${index}`} className={styles.editor} style={{ border: "1px solid #e0e9e3", borderRadius: 8, padding: 10 }}>
            <label>
              <span className={styles.actionHint}>Вопрос {index + 1}</span>
              <input
                value={item.q}
                disabled={disabled}
                onChange={(event) => onChange(items.map((entry, i) => (i === index ? { ...entry, q: event.target.value } : entry)))}
              />
            </label>
            <label>
              <span className={styles.actionHint}>Ответ {index + 1}</span>
              <textarea
                value={item.a}
                disabled={disabled}
                rows={3}
                onChange={(event) => onChange(items.map((entry, i) => (i === index ? { ...entry, a: event.target.value } : entry)))}
              />
            </label>
            <div className={styles.actionRow}>
              <button type="button" className={styles.secondaryButton} disabled={disabled || index === 0} onClick={() => onChange(moveItem(items, index, -1))}>
                ↑ Вверх
              </button>
              <button type="button" className={styles.secondaryButton} disabled={disabled || index === items.length - 1} onClick={() => onChange(moveItem(items, index, 1))}>
                ↓ Вниз
              </button>
              <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={() => onChange(items.filter((_, i) => i !== index))}>
                Удалить
              </button>
            </div>
          </div>
        ))
      ) : (
        <p className={styles.actionHint}>В черновике нет элементов.</p>
      )}
      <div className={styles.actionRow}>
        <button type="button" className={styles.secondaryButton} disabled={disabled || items.length >= max} onClick={() => onChange([...items, { q: "", a: "" }])}>
          Добавить элемент
        </button>
      </div>
    </div>
  );
}

function SeoEditor({ form, disabled, onChange }: { form: SeoForm; disabled: boolean; onChange: (next: SeoForm) => void }) {
  return (
    <div className={styles.editor}>
      {SEO_FIELDS.map((field) => (
        <label key={field.key}>
          <span className={styles.actionHint}>{field.label}</span>
          {field.multiline ? (
            <textarea value={form[field.key]} disabled={disabled} rows={3} onChange={(event) => onChange({ ...form, [field.key]: event.target.value })} />
          ) : (
            <input value={form[field.key]} disabled={disabled} onChange={(event) => onChange({ ...form, [field.key]: event.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

/**
 * P2.10 — static preview of the CURRENT DRAFT merged over hardcoded fallback
 * defaults. Pure client-side merge: this component never calls publish (or any
 * write endpoint); it only renders.
 */
function PreviewPanel({ contentKey, locale, draftPayload }: { contentKey: TabKey; locale: Locale; draftPayload: Record<string, unknown> }) {
  const defaults = LANDING_DEFAULTS[locale];
  const draft = asRecord(draftPayload);

  const merged = {
    heroPre: asString(draft.heroPre) || defaults.heroPre,
    heroAccent: asString(draft.heroAccent) || defaults.heroAccent,
    heroPost: asString(draft.heroPost) || defaults.heroPost,
    heroLede: asString(draft.heroLede) || defaults.heroLede,
    heroMeta: asString(draft.heroMeta) || defaults.heroMeta,
    cta: asString(draft.cta) || defaults.cta,
    finalH2: asString(draft.finalH2) || defaults.finalH2,
    finalP: asString(draft.finalP) || defaults.finalP,
  };
  const stats = statsOf(draft.stats).filter((item) => item.num.trim() || item.label.trim());
  const shownStats = stats.length ? stats : defaults.stats.map(([num, label]) => ({ num, label }));
  const faqDraft = contentKey === "homepage" ? qaListOf(draft.faqItems) : qaListOf(draft.items);
  const shownFaq = faqDraft.length ? faqDraft : defaults.faqItems;
  const faqTitle = contentKey === "faq" ? asString(draft.title) || defaults.faqTitle : defaults.faqTitle;
  const seoFallback = SEO_FALLBACK[locale];
  const seo = {
    title: asString(draft.title) || seoFallback.title,
    description: asString(draft.description) || seoFallback.description,
    canonical: asString(draft.canonical) || seoFallback.canonical,
    ogTitle: asString(draft.ogTitle) || seoFallback.ogTitle,
    ogDescription: asString(draft.ogDescription) || seoFallback.ogDescription,
  };

  return (
    <Panel title="«Предпросмотр — не опубликовано»" eyebrow={`CMS Studio · ${locale.toUpperCase()}`}>
      <p className={styles.actionHint}>
        Статический предпросмотр текущего черновика поверх значений по умолчанию. Здесь ничего не опубликовано; чтобы опубликовать, используйте шаг «Опубликовать».
      </p>
      {contentKey === "seo" ? (
        <div className={styles.editor}>
          <strong>SEO-мета</strong>
          {(
            [
              ["title", seo.title],
              ["description", seo.description],
              ["canonical", seo.canonical],
              ["ogTitle", seo.ogTitle],
              ["ogDescription", seo.ogDescription],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <span className={styles.actionHint}>{label}</span>
              <div>{display(value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.editor} style={{ border: "1px solid #e0e9e3", borderRadius: 9, padding: 14 }}>
            <span className={styles.actionHint}>Hero</span>
            <h2>
              {merged.heroPre} <strong>{merged.heroAccent}</strong>
              {merged.heroPost ? ` ${merged.heroPost}` : ""}
            </h2>
            <p>{merged.heroLede}</p>
            <p className={styles.actionHint}>{merged.heroMeta}</p>
            <span className={styles.primaryButton} aria-hidden="true">
              {merged.cta}
            </span>
          </div>
          <div className={styles.editor}>
            <strong>Статистика</strong>
            <ul>
              {shownStats.map((item) => (
                <li key={`${item.num}-${item.label}`}>
                  <strong>{display(item.num)}</strong> — {display(item.label)}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.editor}>
            <strong>{display(faqTitle)}</strong>
            {shownFaq.map((item, index) => (
              <details key={`${item.q}-${index}`} open={index === 0}>
                <summary>{display(item.q)}</summary>
                <p>{display(item.a)}</p>
              </details>
            ))}
          </div>
          {contentKey === "homepage" ? (
            <div className={styles.editor} style={{ border: "1px solid #e0e9e3", borderRadius: 9, padding: 14 }}>
              <span className={styles.actionHint}>Финальный призыв</span>
              <h2>{merged.finalH2}</h2>
              <p>{merged.finalP}</p>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/** P2.11 — version list, two-version comparison, restore-to-draft. */
function HistoryPanel({ contentKey, locale, canEdit, onRestored }: { contentKey: TabKey; locale: Locale; canEdit: boolean; onRestored: () => void }) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [leftVersion, setLeftVersion] = useState<number | null>(null);
  const [rightVersion, setRightVersion] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  function reloadVersions() {
    setLoading(true);
    setError(null);
    setRevision((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    void apiJson<{ data: VersionEntry[] }>(`/api/admin/content/${encodeURIComponent(contentKey)}/versions?locale=${encodeURIComponent(locale)}`)
      .then((result) => {
        if (!active) return;
        const list = result.data ?? [];
        setVersions(list);
        if (list.length >= 2) {
          setLeftVersion((current) => current ?? list[0]?.version ?? null);
          setRightVersion((current) => current ?? list[1]?.version ?? null);
        } else if (list.length === 1) {
          setLeftVersion((current) => current ?? list[0]?.version ?? null);
        }
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить версии.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contentKey, locale, revision]);

  const leftPayload = versions.find((entry) => entry.version === leftVersion)?.payload ?? null;
  const rightPayload = versions.find((entry) => entry.version === rightVersion)?.payload ?? null;
  const comparison = leftVersion !== null && rightVersion !== null ? diffPayloads(rightPayload, leftPayload) : [];

  async function restoreVersion(version: number, reason: string) {
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      const saved = await apiJson<{ version: number }>(`/api/admin/content/${encodeURIComponent(contentKey)}/restore`, {
        method: "POST",
        body: JSON.stringify({ locale, version, reason }),
      });
      setRestoreNotice(`Версия v${version} восстановлена как новый черновик v${saved.version}. Не опубликовано.`);
      setRestoreTarget(null);
      reloadVersions();
      onRestored();
    } catch (reason_) {
      setRestoreError(reason_ instanceof Error ? reason_.message : "Не удалось восстановить версию.");
    } finally {
      setRestoreBusy(false);
    }
  }

  return (
    <Panel title="История / Сравнение" eyebrow={`CMS Studio · ${TAB_LABELS[contentKey]}`}>
      {loading ? <p className={styles.actionHint}>Загрузка версий…</p> : null}
      {error ? (
        <div>
          <p className={styles.error}>{error}</p>
          <button type="button" className={styles.secondaryButton} onClick={reloadVersions}>
            Повторить
          </button>
        </div>
      ) : null}
      {!loading && !error && !versions.length ? <p className={styles.actionHint}>Для этого ключа и локали версий пока нет.</p> : null}
      {!loading && !error && versions.length ? (
        <div className={styles.stack}>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>версия</th>
                  <th>статус</th>
                  <th>создал</th>
                  <th>создан</th>
                  <th>опубликовал</th>
                  <th>опубликован</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((entry) => (
                  <tr key={entry.version}>
                    <td>v{entry.version}</td>
                    <td>
                      <StatusPill value={entry.status} />
                    </td>
                    <td title={display(entry.createdBy)}>{display(entry.createdBy)}</td>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td title={display(entry.publishedBy)}>{display(entry.publishedBy)}</td>
                    <td>{formatDate(entry.publishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.inlineFields}>
            <label>
              <span className={styles.actionHint}>Сравнение A (новее)</span>
              <select value={leftVersion ?? ""} onChange={(event) => setLeftVersion(Number(event.target.value))} aria-label="Сравнить версию A">
                {versions.map((entry) => (
                  <option key={entry.version} value={entry.version}>
                    v{entry.version} ({entry.status})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={styles.actionHint}>Сравнение B (старее)</span>
              <select value={rightVersion ?? ""} onChange={(event) => setRightVersion(Number(event.target.value))} aria-label="Сравнить версию B">
                {versions.map((entry) => (
                  <option key={entry.version} value={entry.version}>
                    v{entry.version} ({entry.status})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {leftVersion !== null && rightVersion !== null ? (
            comparison.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>поле</th>
                      <th>v{rightVersion}</th>
                      <th>v{leftVersion}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((row) => (
                      <tr key={row.path}>
                        <td title={row.path}>{row.path}</td>
                        <td title={row.oldText}>{row.oldText}</td>
                        <td title={row.newText}>{row.newText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.notice}>Нет различий между v{leftVersion} и v{rightVersion}.</p>
            )
          ) : null}

          <div className={styles.editor}>
            <strong>Восстановить версию в черновик</strong>
            <p className={styles.actionHint}>Восстановление создаёт НОВУЮ версию черновика из выбранной полезной нагрузки; сама выбранная версия никогда не изменяется и не публикуется.</p>
            {restoreError ? <p className={styles.error}>{restoreError}</p> : null}
            {restoreNotice ? <p className={styles.notice}>{restoreNotice}</p> : null}
            {restoreTarget === null ? (
              <div className={styles.actionRow}>
                {versions.map((entry) => (
                  <button
                    key={entry.version}
                    type="button"
                    className={styles.secondaryButton}
                    disabled={!canEdit}
                    onClick={() => setRestoreTarget(entry.version)}
                  >
                    Восстановить v{entry.version}…
                  </button>
                ))}
              </div>
            ) : (
              <ConfirmAction
                action={`Восстановить ${TAB_LABELS[contentKey]} v${restoreTarget} в черновик`}
                consequence={`Создаёт новый черновик из v${restoreTarget}. Текущий опубликованный контент не затрагивается, пока вы не опубликуете.`}
                busy={restoreBusy}
                error={restoreError}
                onCancel={() => setRestoreTarget(null)}
                onConfirm={(reason) => {
                  if (restoreTarget !== null) void restoreVersion(restoreTarget, reason);
                }}
              />
            )}
            {!canEdit ? <p className={styles.actionHint}>Требуется content.edit</p> : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
