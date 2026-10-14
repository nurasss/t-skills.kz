"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import styles from "./admin-console.module.css";

export type JsonRecord = Record<string, unknown>;
export type Viewer = { email: string; fullName?: string | null; displayName?: string | null };

export const PAGE_SIZE = 25;

export function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function str(row: JsonRecord, key: string, fallback = "—") {
  const value = row[key];
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

export function usageNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nested(row: JsonRecord, key: string): JsonRecord {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function nestedList(row: JsonRecord, ...keys: string[]): JsonRecord[] {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value.filter((item): item is JsonRecord => !!item && typeof item === "object");
  }
  return [];
}

export function records(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is JsonRecord => !!item && typeof item === "object");
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    for (const key of ["items", "data", "orders", "results"]) if (Array.isArray(record[key])) return records(record[key]);
  }
  return [];
}

export function paginationOf(value: unknown): { page: number; total: number; hasNext: boolean } {
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    const pagination = record.pagination;
    if (pagination && typeof pagination === "object" && !Array.isArray(pagination)) {
      const page = pagination as JsonRecord;
      return {
        page: Number(page.page ?? 1) || 1,
        total: Number(page.total ?? 0) || 0,
        hasNext: Boolean(page.hasNext),
      };
    }
  }
  return { page: 1, total: 0, hasNext: false };
}

export function formatDate(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const millis = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(millis)) return String(value);
  try {
    return new Date(millis).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(value);
  }
}

export function formatDateShort(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const millis = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(millis)) return String(value);
  try {
    return new Date(millis).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return String(value);
  }
}

export function formatMoney(minor: unknown, currency: unknown) {
  const amount = usageNum(minor);
  if (amount === null) return "—";
  const code = currency ? String(currency) : "";
  return `${(amount / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}${code ? ` ${code}` : ""}`;
}

export function formatDiscount(row: JsonRecord) {
  const type = str(row, "discountType", "");
  const value = usageNum(row.discountValue);
  const currency = str(row, "currency", "");
  if (type === "FREE_ACCESS") return "Free access";
  if (type === "PERCENT") return value === null ? "Percent" : `${value}%`;
  if (type === "FIXED_AMOUNT") return value === null ? "Fixed" : formatMoney(value, currency);
  return display(row.discountType);
}

export function formatValidity(row: JsonRecord) {
  const from = row.validFrom ?? row.valid_from;
  const until = row.validUntil ?? row.valid_until;
  if ((from === null || from === undefined || from === "") && (until === null || until === undefined || until === "")) return "Бессрочно";
  return `${formatDateShort(from)} → ${until === null || until === undefined || until === "" ? "∞" : formatDateShort(until)}`;
}

export function toDateTimeLocalInput(value: unknown) {
  const millis = usageNum(value);
  if (millis === null) return "";
  const date = new Date(millis);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDateTimeLocal(value: string): number | null {
  if (!value.trim()) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

export async function apiJson<T = JsonRecord>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(typeof error === "object" && error ? String((error as JsonRecord).message ?? "Request failed") : String(payload?.message ?? `HTTP ${response.status}`));
  }
  return payload as T;
}

export function useResource<T = JsonRecord>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void apiJson<T>(url).then((result) => { if (active) { setData(result); setError(null); setLoading(false); } }).catch((reason: unknown) => { if (active) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные."); setLoading(false); } });
    return () => { active = false; };
  }, [url, revision]);
  return { data, error, loading, refresh };
}

export function useDebouncedValue(value: string, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function Panel({ title, eyebrow, children, action }: { title: string; eyebrow?: string; children: ReactNode; action?: ReactNode }) {
  return <section className={styles.panel}><header className={styles.panelHead}><div>{eyebrow ? <span className={styles.kicker}>{eyebrow}</span> : null}<h2>{title}</h2></div>{action ?? null}</header>{children}</section>;
}

export function Table({ data, columns, labels, onSelect, selectedId, loading }: { data: JsonRecord[]; columns: string[]; labels?: Record<string, string>; onSelect?: (row: JsonRecord) => void; selectedId?: string | null; loading?: boolean }) {
  const header = (column: string) => labels?.[column] ?? column.replaceAll("_", " ");
  return <div className={styles.tableWrap}><table><thead><tr>{columns.map((column) => <th key={column}>{header(column)}</th>)}</tr></thead><tbody>{loading ? <tr><td className={styles.empty} colSpan={columns.length}>Загрузка…</td></tr> : data.length ? data.map((row, index) => {
    const id = String(row.id ?? row.key ?? row.code ?? index);
    const selected = selectedId !== undefined && selectedId !== null && String(row.id ?? "") === selectedId;
    return <tr key={id} onClick={onSelect ? () => onSelect(row) : undefined} onKeyDown={onSelect ? (event) => { if (event.key === "Enter") onSelect(row); } : undefined} tabIndex={onSelect ? 0 : undefined} style={onSelect ? { cursor: "pointer", background: selected ? "#f2f8ef" : undefined } : undefined}>{columns.map((column) => <td key={column} title={display(row[column])}>{display(row[column])}</td>)}</tr>;
  }) : <tr><td className={styles.empty} colSpan={columns.length}>Нет данных</td></tr>}</tbody></table></div>;
}

export function Mutation({ label, endpoint, method = "POST", payload, confirmation, onDone }: { label: string; endpoint: string; method?: "POST" | "PATCH" | "DELETE"; payload: JsonRecord; confirmation?: string; onDone?: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit() { if (confirmation && !window.confirm(confirmation)) return; try { await apiJson(endpoint, { method, body: JSON.stringify(payload) }); setDone(true); setError(null); onDone?.(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие."); } }
  return <>{error ? <p className={styles.error}>{error}</p> : null}{done ? <p className={styles.notice}>Готово: {label}</p> : null}<button type="button" className={styles.primaryButton} onClick={submit}>{label}</button></>;
}

export function Pager({ page, total, limit, hasNext, onPage }: { page: number; total: number; limit: number; hasNext: boolean; onPage: (page: number) => void }) {
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
  return <div className={styles.inlineFields}><span className={styles.actionHint}>Стр. {page} из {totalPages} · всего {total}</span><span style={{ flex: "1 1 auto" }} /><button type="button" className={styles.secondaryButton} disabled={page <= 1} onClick={() => onPage(page - 1)}>← Назад</button><button type="button" className={styles.secondaryButton} disabled={!hasNext} onClick={() => onPage(page + 1)}>Вперёд →</button></div>;
}

/** P2.15 — единое подтверждение опасных действий: название, последствия, причина, Отмена/Подтвердить. */
export function ConfirmAction({ action, consequence, onCancel, onConfirm, busy, error }: { action: string; consequence: string; onCancel: () => void; onConfirm: (reason: string) => void; busy?: boolean; error?: string | null }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const valid = reason.trim().length > 0;
  return <div className={styles.editor} style={{ border: "1px solid #f0c9bd", borderRadius: 9, padding: 12, background: "#fff8f5" }}>
    <strong>Подтвердить: {action}</strong>
    <p className={styles.actionHint} style={{ marginTop: 4 }}>{consequence}</p>
    <input placeholder="Причина (обязательно, попадёт в audit)" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Причина действия" />
    {touched && !valid ? <p className={styles.error}>Укажите причину — без неё действие запрещено.</p> : null}
    {error ? <p className={styles.error}>{error}</p> : null}
    <div className={styles.actionRow}>
      <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>Отмена</button>
      <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => { setTouched(true); if (valid) onConfirm(reason.trim()); }}>{busy ? "Выполняется…" : `Подтвердить: ${action}`}</button>
    </div>
  </div>;
}

export function DetailShell({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  return <Panel title={title} eyebrow={eyebrow} action={<button type="button" className={styles.secondaryButton} onClick={onClose}>✕ Закрыть</button>}>{children}</Panel>;
}

export function Kv({ label, value }: { label: string; value: ReactNode }) {
  return <div><span className={styles.actionHint}>{label}</span><div><strong>{value}</strong></div></div>;
}

export function StatusPill({ value }: { value: unknown }) {
  const text = display(value);
  const tone = /^(ACTIVE|PAID|COMPLETE|REDEEMED|PUBLISHED)$/.test(text) ? "#17633f" : /^(DISABLED|BLOCKED|FAILED|EXPIRED|REVOKED|ARCHIVED|PAYMENT_FAILED)$/.test(text) ? "#9c3a2a" : "#375449";
  return <span style={{ color: tone, fontWeight: 700 }}>{text}</span>;
}

export function Metric({ label, value }: { label: string; value: unknown }) { return <article className={styles.metric}><span>{label}</span><strong>{display(value)}</strong></article>; }
export function List({ title, endpoint, columns, labels }: { title: string; endpoint: string; columns: string[]; labels?: Record<string, string> }) { const resource = useResource(endpoint); return <div className={styles.stack}><Panel title={title}><Table data={records(resource.data)} columns={columns} labels={labels} loading={resource.loading} />{resource.error ? <p className={styles.error}>{resource.error}</p> : null}<button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></Panel></div>; }
