"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import styles from "./admin-console.module.css";

type JsonRecord = Record<string, unknown>;
type Viewer = { email: string; fullName?: string | null; displayName?: string | null };
type Props = { viewer: Viewer; permissions: string[] };

const NAV = [
  ["Overview", "overview", "dashboard.read"], ["Sales", "orders", "orders.read"], ["Sales", "promos", "promos.read"], ["Sales", "campaigns", "campaigns.read"], ["Sales", "entitlements", "entitlements.read"],
  ["Users", "users", "users.read"], ["Content", "content", "content.read"], ["Content", "pricing", "pricing.read"], ["Career", "careers", "careers.read"],
  ["Assessment", "assessment", "assessment.read"], ["Analytics", "analytics", "analytics.read"], ["System", "audit", "audit.read"], ["System", "system", "settings.read"],
] as const;

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function records(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is JsonRecord => !!item && typeof item === "object");
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    for (const key of ["items", "data", "orders", "results"]) if (Array.isArray(record[key])) return records(record[key]);
  }
  return [];
}

async function apiJson<T = JsonRecord>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(typeof error === "object" && error ? String((error as JsonRecord).message ?? "Request failed") : String(payload?.message ?? `HTTP ${response.status}`));
  }
  return payload as T;
}

function useResource<T = JsonRecord>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    void apiJson<T>(url).then((result) => { if (active) { setData(result); setError(null); } }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные."); });
    return () => { active = false; };
  }, [url, revision]);
  return { data, error, refresh };
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return <section className={styles.panel}><header className={styles.panelHead}><div>{eyebrow ? <span className={styles.kicker}>{eyebrow}</span> : null}<h2>{title}</h2></div></header>{children}</section>;
}

function Table({ data, columns }: { data: JsonRecord[]; columns: string[] }) {
  return <div className={styles.tableWrap}><table><thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{data.length ? data.map((row, index) => <tr key={String(row.id ?? row.key ?? row.code ?? index)}>{columns.map((column) => <td key={column} title={display(row[column])}>{display(row[column])}</td>)}</tr>) : <tr><td className={styles.empty} colSpan={columns.length}>Нет данных</td></tr>}</tbody></table></div>;
}

function Details({ label, endpoint }: { label: string; endpoint: string }) {
  const [id, setId] = useState("");
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() { if (!id.trim()) return; try { setData(await apiJson(`${endpoint}${encodeURIComponent(id.trim())}`)); setError(null); } catch (reason) { setData(null); setError(reason instanceof Error ? reason.message : "Не удалось загрузить детали."); } }
  return <div className={styles.editor}><div className={styles.inlineFields}><input value={id} onChange={(event) => setId(event.target.value)} placeholder={`${label} ID`} /><button type="button" className={styles.secondaryButton} onClick={load}>Открыть детали</button></div>{error ? <p className={styles.error}>{error}</p> : null}{data ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>{JSON.stringify(data, null, 2)}</pre> : null}</div>;
}

function Mutation({ label, endpoint, method = "POST", payload, confirmation, onDone }: { label: string; endpoint: string; method?: "POST" | "PATCH" | "DELETE"; payload: JsonRecord; confirmation?: string; onDone?: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit() { if (confirmation && !window.confirm(confirmation)) return; try { await apiJson(endpoint, { method, body: JSON.stringify(payload) }); setDone(true); setError(null); onDone?.(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие."); } }
  return <>{error ? <p className={styles.error}>{error}</p> : null}{done ? <p className={styles.notice}>Готово: {label}</p> : null}<button type="button" className={styles.primaryButton} onClick={submit}>{label}</button></>;
}

export function AdminConsole({ viewer, permissions }: Props) {
  const allowed = useMemo(() => NAV.filter(([, , permission]) => permissions.includes(permission)), [permissions]);
  const [section, setSection] = useState<string>(allowed[0]?.[1] ?? "overview");
  const visibleSection = allowed.some(([, id]) => id === section) ? section : (allowed[0]?.[1] ?? "overview");
  const groups = useMemo(() => [...new Set(allowed.map(([group]) => group))], [allowed]);
  const sectionTitle = allowed.find(([, id]) => id === visibleSection)?.[0] ?? "Admin";
  return <div className={styles.shell}><aside className={styles.sidebar}><div className={styles.brand}><span className={styles.brandMark}>T</span><div><strong>T-Skills</strong><small>Control plane</small></div></div><nav className={styles.navGroups}>{groups.map((group) => <div className={styles.navGroup} key={group}><span className={styles.navLabel}>{group}</span>{allowed.filter(([itemGroup]) => itemGroup === group).map(([, id]) => <button key={id} type="button" onClick={() => setSection(id)} className={`${styles.navItem} ${visibleSection === id ? styles.navActive : ""}`}><span className={styles.navBullet}>●</span>{id.replaceAll("-", " ")}</button>)}</div>)}</nav><div className={styles.sidebarFoot}><span className={styles.liveDot} /> Protected session<div>{viewer.email}</div></div></aside><main className={styles.main}><header className={styles.topbar}><div><span className={styles.kicker}>T-SKILLS / ADMIN</span><h1>{sectionTitle}</h1></div><div className={styles.identity}><span>{viewer.fullName || viewer.displayName || viewer.email}</span><span className={styles.avatar}>{(viewer.fullName || viewer.email).slice(0, 1).toUpperCase()}</span></div></header>{visibleSection === "overview" ? <Overview /> : null}{visibleSection === "orders" ? <Orders /> : null}{visibleSection === "promos" ? <Promos /> : null}{visibleSection === "campaigns" ? <Campaigns /> : null}{visibleSection === "entitlements" ? <Entitlements /> : null}{visibleSection === "users" ? <Users /> : null}{visibleSection === "content" ? <Content /> : null}{visibleSection === "pricing" ? <Pricing canManage={permissions.includes("pricing.manage")} /> : null}{visibleSection === "careers" ? <Careers /> : null}{visibleSection === "assessment" ? <Assessment /> : null}{visibleSection === "analytics" ? <List title="Analytics" endpoint="/api/admin/analytics?days=30" columns={["name", "count", "state", "duration"]} /> : null}{visibleSection === "audit" ? <List title="Audit log" endpoint="/api/admin/audit?limit=100" columns={["created_at", "actor_role", "action", "entity_type", "entity_id", "reason"]} /> : null}{visibleSection === "system" ? <System /> : null}</main></div>;
}

function Metric({ label, value }: { label: string; value: unknown }) { return <article className={styles.metric}><span>{label}</span><strong>{display(value)}</strong></article>; }
function List({ title, endpoint, columns }: { title: string; endpoint: string; columns: string[] }) { const resource = useResource(endpoint); return <div className={styles.stack}><Panel title={title}><Table data={records(resource.data)} columns={columns} />{resource.error ? <p className={styles.error}>{resource.error}</p> : null}<button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></Panel></div>; }
function Overview() { const resource = useResource("/api/admin/overview"); const data = resource.data ?? {}; const sales = (data.sales ?? {}) as JsonRecord; const users = (data.users ?? {}) as JsonRecord; const funnel = (data.funnel ?? {}) as JsonRecord; return <div className={styles.stack}>{resource.error ? <p className={styles.error}>{resource.error}</p> : null}<div className={styles.metricGrid}><Metric label="Выручка 7 дней" value={sales.revenue7Days} /><Metric label="Paid orders" value={sales.paidOrders} /><Metric label="Пользователи" value={users.registered} /><Metric label="Reports" value={funnel.reportGenerated} /></div><Panel title="Assessment funnel" eyebrow="АГРЕГИРОВАННЫЕ ДАННЫЕ"><div className={styles.funnel}>{["registered", "entitled", "started", "coreCompleted", "clarificationCompleted", "reportGenerated"].map((key) => <div key={key}><span>{key}</span><strong>{display(funnel[key])}</strong></div>)}</div></Panel><Panel title="Assessment versions" eyebrow="IMMUTABLE REGISTRY"><Table data={records(data.assessmentVersions)} columns={["product_id", "version", "status", "scoring_version", "item_count"]} /></Panel><button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></div>; }
function Orders() { const resource = useResource("/api/admin/orders?limit=100"); return <div className={styles.stack}><Panel title="Заказы и timeline" eyebrow="SALES"><Table data={records(resource.data)} columns={["id", "email", "test_id", "original_amount_minor", "discount_amount_minor", "final_amount_minor", "status", "created_at"]} /><Details label="Order" endpoint="/api/admin/orders/" /></Panel></div>; }

function Promos() {
  const resource = useResource("/api/admin/promo-codes?limit=100");
  const [form, setForm] = useState({ code: "", name: "", discount_type: "PERCENT", discount_value: "10", currency: "KZT", max_total_uses: "", max_uses_per_user: "" });
  const [edit, setEdit] = useState({ id: "", status: "ACTIVE", valid_from: "", valid_until: "", reason: "" });
  const create = { ...form, discount_value: Number(form.discount_value), max_total_uses: form.max_total_uses ? Number(form.max_total_uses) : null, max_uses_per_user: form.max_uses_per_user ? Number(form.max_uses_per_user) : null };
  const update = { status: edit.status, valid_from: edit.valid_from ? Date.parse(edit.valid_from) : null, valid_until: edit.valid_until ? Date.parse(edit.valid_until) : null, reason: edit.reason };
  return <div className={styles.stack}><Panel title="Промокоды" eyebrow="RESERVED → REDEEMED / RELEASED"><div className={styles.formGrid}><input placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /><input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option>PERCENT</option><option>FIXED_AMOUNT</option><option>FREE_ACCESS</option></select><input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /><input placeholder="Max total uses" value={form.max_total_uses} onChange={(e) => setForm({ ...form, max_total_uses: e.target.value })} /><input placeholder="Max per user" value={form.max_uses_per_user} onChange={(e) => setForm({ ...form, max_uses_per_user: e.target.value })} /><Mutation label="Создать промокод" endpoint="/api/admin/promo-codes" payload={create} onDone={resource.refresh} /></div><div className={styles.formGrid}><input placeholder="Promo ID" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} /><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>ACTIVE</option><option>DRAFT</option><option>DISABLED</option></select><input type="datetime-local" value={edit.valid_from} onChange={(e) => setEdit({ ...edit, valid_from: e.target.value })} /><input type="datetime-local" value={edit.valid_until} onChange={(e) => setEdit({ ...edit, valid_until: e.target.value })} /><input placeholder="Причина" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />{edit.id && edit.reason ? <Mutation label="Сохранить validity" endpoint={`/api/admin/promo-codes/${encodeURIComponent(edit.id)}`} method="PATCH" payload={update} confirmation="Изменить условия промокода?" onDone={resource.refresh} /> : null}</div><Table data={records(resource.data)} columns={["id", "code", "name", "discountType", "usage", "status"]} /><Details label="Promo: details and redemptions" endpoint="/api/admin/promo-codes/" /></Panel></div>;
}

function Campaigns() {
  const resource = useResource("/api/admin/campaigns?limit=100");
  const [form, setForm] = useState({ name: "", client_name: "", client_type: "SCHOOL", seat_limit: "100", default_test_id: "t-skills" });
  return <div className={styles.stack}><Panel title="B2B campaigns"><div className={styles.formGrid}><input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input placeholder="Клиент" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /><select value={form.client_type} onChange={(e) => setForm({ ...form, client_type: e.target.value })}><option>SCHOOL</option><option>UNIVERSITY</option><option>COMPANY</option><option>PARTNER</option><option>OTHER</option></select><input type="number" value={form.seat_limit} onChange={(e) => setForm({ ...form, seat_limit: e.target.value })} /><Mutation label="Создать кампанию" endpoint="/api/admin/campaigns" payload={{ ...form, seat_limit: Number(form.seat_limit) }} onDone={resource.refresh} /></div><Table data={records(resource.data)} columns={["id", "name", "client_name", "status", "seat_limit", "activated", "completed", "unused"]} /><Details label="Campaign" endpoint="/api/admin/campaigns/" /></Panel></div>;
}

function Users() {
  const [search, setSearch] = useState("");
  const resource = useResource(`/api/admin/users?limit=100&search=${encodeURIComponent(search)}`);
  const [form, setForm] = useState({ userId: "", action: "FORCE_LOGOUT", reason: "", entitlement_id: "", test_id: "t-skills" });
  const body: JsonRecord = { action: form.action, reason: form.reason, entitlement_id: form.entitlement_id || undefined, grant: ["GRANT_ACCESS", "ALLOW_RETAKE"].includes(form.action) ? { test_id: form.test_id, reason: form.reason } : undefined };
  return <div className={styles.stack}><Panel title="Users and support"><div className={styles.toolbar}><input placeholder="Email, ID, имя" value={search} onChange={(e) => setSearch(e.target.value)} /><button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Найти</button></div><Table data={records(resource.data)} columns={["id", "email", "full_name", "status", "entitlements", "assessments", "last_activity"]} /><Details label="User" endpoint="/api/admin/users/" /><div className={styles.formGrid}><input placeholder="User ID" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} /><select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}><option>FORCE_LOGOUT</option><option>GRANT_ACCESS</option><option>ALLOW_RETAKE</option><option>REVOKE_ENTITLEMENT</option><option>INVALIDATE_UNFINISHED</option><option>BLOCK_ACCOUNT</option><option>UNBLOCK_ACCOUNT</option><option>RESEND_REPORT</option></select><input placeholder="Entitlement ID" value={form.entitlement_id} onChange={(e) => setForm({ ...form, entitlement_id: e.target.value })} /><input placeholder="Test ID" value={form.test_id} onChange={(e) => setForm({ ...form, test_id: e.target.value })} /><input placeholder="Причина" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />{form.userId ? <Mutation label="Выполнить" endpoint={`/api/admin/users/${encodeURIComponent(form.userId)}/support`} payload={body} confirmation="Подтвердить support-действие?" onDone={resource.refresh} /> : null}</div></Panel></div>;
}

function Entitlements() {
  const resource = useResource("/api/admin/entitlements?limit=100");
  const [form, setForm] = useState({ userId: "", test_id: "t-skills", reason: "", campaign_id: "" });
  return <div className={styles.stack}><Panel title="Manual entitlements"><div className={styles.formGrid}><input placeholder="User ID" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} /><input placeholder="Test" value={form.test_id} onChange={(e) => setForm({ ...form, test_id: e.target.value })} /><input placeholder="Причина" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />{form.userId && form.reason ? <Mutation label="Выдать доступ" endpoint={`/api/admin/users/${encodeURIComponent(form.userId)}/grant`} payload={{ test_id: form.test_id, reason: form.reason, campaign_id: form.campaign_id || null }} confirmation="Выдать новый entitlement без Stripe-заказа?" onDone={resource.refresh} /> : null}</div><Table data={records(resource.data)} columns={["id", "email", "test_id", "grant_source", "status", "created_at"]} /></Panel></div>;
}

function Content() {
  const [locale, setLocale] = useState("ru");
  const resource = useResource(`/api/admin/content?limit=100&locale=${locale}`);
  const [payload, setPayload] = useState({ heroPre: "", heroAccent: "", heroLede: "", cta: "", heroMeta: "", finalP: "" });
  const [version, setVersion] = useState("");
  const [reason, setReason] = useState("");
  return <div className={styles.stack}><Panel title="CMS homepage" eyebrow="DRAFT → PUBLISHED"><div className={styles.inlineFields}><select value={locale} onChange={(e) => setLocale(e.target.value)}><option value="ru">RU</option><option value="kk">KK</option></select></div><div className={styles.formGrid}>{Object.entries(payload).map(([key, value]) => <input key={key} placeholder={key} value={value} onChange={(e) => setPayload({ ...payload, [key]: e.target.value })} />)}<Mutation label="Сохранить draft" endpoint="/api/admin/content" payload={{ content_key: "homepage", locale, payload }} onDone={resource.refresh} /></div><div className={styles.inlineFields}><input type="number" placeholder="Version" value={version} onChange={(e) => setVersion(e.target.value)} /><input placeholder="Причина" value={reason} onChange={(e) => setReason(e.target.value)} />{version ? <Mutation label="Publish" endpoint="/api/admin/content/homepage/publish" payload={{ locale, version: Number(version), reason: reason || "Публикация CMS" }} confirmation="Опубликовать выбранную RU/KK версию на landing?" onDone={resource.refresh} /> : null}{version ? <Mutation label="Restore → draft" endpoint="/api/admin/content/homepage/restore" payload={{ locale, version: Number(version), reason: reason || "Восстановление CMS" }} onDone={resource.refresh} /> : null}</div><Table data={records(resource.data)} columns={["contentKey", "locale", "currentVersion", "publishedVersion", "draftStatus", "publishedStatus"]} /></Panel></div>;
}

function Pricing({ canManage }: { canManage: boolean }) {
  const resource = useResource("/api/admin/pricing");
  const [form, setForm] = useState({ test_id: "t-skills", name: "T-Skills", amount_minor: "150000", currency: "KZT", reason: "" });
  return <div className={styles.stack}><Panel title="Pricing registry" eyebrow="ORDER SNAPSHOTS">{canManage ? <div className={styles.formGrid}><input value={form.test_id} onChange={(e) => setForm({ ...form, test_id: e.target.value })} /><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input type="number" value={form.amount_minor} onChange={(e) => setForm({ ...form, amount_minor: e.target.value })} /><input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /><input placeholder="Причина" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />{form.reason ? <Mutation label="Сохранить цену" endpoint="/api/admin/pricing" method="PATCH" payload={{ ...form, amount_minor: Number(form.amount_minor) }} confirmation="Изменить цену только для новых заказов?" onDone={resource.refresh} /> : null}</div> : <p className={styles.actionHint}>Доступ только к просмотру цен. Изменение требует pricing.manage.</p>}<Table data={records(resource.data)} columns={["test_id", "name", "amount_minor", "currency", "updated_at", "versions"]} /></Panel></div>;
}

function Careers() {
  const resource = useResource("/api/admin/careers?limit=100");
  const [form, setForm] = useState({ catalog_version: "t-skills-career-catalog-v1", slug: "", title_ru: "", title_kk: "", description_ru: "", description_kk: "", category: "", source_version: "editorial-v1" });
  const [version, setVersion] = useState("");
  const [reason, setReason] = useState("");
  return <div className={styles.stack}><Panel title="Career catalog" eyebrow="CONTENT ONLY"><p className={styles.actionHint}>Профессии редактируются отдельно от неизменяемого matching model.</p><div className={styles.formGrid}>{Object.entries(form).map(([key, value]) => <input key={key} placeholder={key} value={value} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}<Mutation label="Save draft entry" endpoint="/api/admin/careers" payload={form} onDone={resource.refresh} /></div><div className={styles.inlineFields}><input placeholder="Catalog version" value={version} onChange={(e) => setVersion(e.target.value)} /><input placeholder="Причина" value={reason} onChange={(e) => setReason(e.target.value)} />{version ? <Mutation label="Publish catalog" endpoint="/api/admin/careers/publish" payload={{ version, reason: reason || "Публикация catalog" }} confirmation="Опубликовать неизменяемую версию каталога?" onDone={resource.refresh} /> : null}</div><Table data={records(resource.data)} columns={["catalog_version", "slug", "title_ru", "title_kk", "category", "status"]} /></Panel></div>;
}

function Assessment() {
  const resource = useResource("/api/admin/assessment/versions");
  const [form, setForm] = useState({ product_id: "t-skills", version: "", scoring_version: "pairwise-scoring-v1", content_version: "t-skills-pairwise-items-v1", career_model_version: "career-matching-v1", report_version: "t-skills-report-v1", adaptive_version: "career-adaptive-v1", item_count: "75" });
  const [id, setId] = useState("");
  return <div className={styles.stack}><Panel title="Assessment registry" eyebrow="EXECUTABLE RUNTIME REQUIRED"><div className={styles.formGrid}>{Object.entries(form).map(([key, value]) => <input key={key} placeholder={key} value={value} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}<Mutation label="Create draft" endpoint="/api/admin/assessment/versions" payload={{ ...form, item_count: Number(form.item_count) }} onDone={resource.refresh} /></div><div className={styles.inlineFields}><input placeholder="Version ID" value={id} onChange={(e) => setId(e.target.value)} />{id ? <Mutation label="Publish" endpoint={`/api/admin/assessment/versions/${encodeURIComponent(id)}/publish`} payload={{ reason: "Публикация executable version" }} confirmation="Publish проверит item bank, scorer, adaptive and report runtime. Продолжить?" onDone={resource.refresh} /> : null}</div><Table data={records(resource.data)} columns={["id", "version", "status", "scoring_version", "career_model_version", "item_count", "published_at"]} /></Panel></div>;
}

function System() {
  const features = useResource("/api/admin/features");
  const settings = useResource("/api/admin/settings");
  const [reason, setReason] = useState("");
  return <div className={styles.stack}><Panel title="Feature flags" eyebrow="ALLOWLISTED"><p className={styles.actionHint}>payments_enabled и maintenance_mode подключены к runtime. Неиспользуемый t_skills_v5_enabled удалён из UI.</p><input placeholder="Причина изменения" value={reason} onChange={(e) => setReason(e.target.value)} />{records(features.data).map((flag) => reason ? <div className={styles.flag} key={String(flag.key)}><span><b>{display(flag.key)}</b><small>{display(flag.description)}</small></span><Mutation label={Boolean(flag.enabled) ? "ON" : "OFF"} endpoint="/api/admin/features" method="PATCH" payload={{ key: flag.key, enabled: !Boolean(flag.enabled), reason }} confirmation={`Переключить ${display(flag.key)}?`} onDone={features.refresh} /></div> : null)}<Table data={records(features.data)} columns={["key", "enabled", "description", "updated_at"]} /></Panel><Panel title="Settings"><Table data={records(settings.data)} columns={["key", "value", "updated_at"]} /></Panel></div>;
}
