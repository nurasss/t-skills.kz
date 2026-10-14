"use client";

import { useMemo, useState } from "react";

import styles from "./admin-console.module.css";
import { PAGE_SIZE, display, str, usageNum, nested, nestedList, records, paginationOf, formatDate, formatMoney, formatDiscount, formatValidity, toDateTimeLocalInput, parseDateTimeLocal, apiJson, useResource, useDebouncedValue, Panel, Table, Mutation, Pager, ConfirmAction, DetailShell, Kv, StatusPill, Metric, List, type JsonRecord, type Viewer } from "./ui-kit";
import { SystemAccess } from "./system-access";
import { CmsStudio } from "./cms-studio";
import { AssessmentSafety, ReportVersions, SystemSettingsPanel } from "./ops-panels";

type Props = { viewer: Viewer; permissions: string[] };

const NAV = [
  ["Overview", "overview", "dashboard.read"], ["Sales", "orders", "orders.read"], ["Sales", "promos", "promos.read"], ["Sales", "campaigns", "campaigns.read"], ["Sales", "entitlements", "entitlements.read"],
  ["Users", "users", "users.read"], ["Content", "content", "content.read"], ["Content", "pricing", "pricing.read"], ["Career", "careers", "careers.read"],
  ["Assessment", "assessment", "assessment.read"], ["Assessment", "reports", "assessment.read"], ["Analytics", "analytics", "analytics.read"], ["System", "audit", "audit.read"], ["System", "system", "settings.read"],
] as const;

const NAV_RU: Record<string, string> = {
  Overview: "Обзор", Sales: "Продажи", Users: "Пользователи", Content: "Контент",
  Career: "Карьера", Assessment: "Оценка", Analytics: "Аналитика", System: "Система",
  overview: "Обзор", orders: "Заказы", promos: "Промокоды", campaigns: "Кампании",
  entitlements: "Доступы", users: "Пользователи", content: "Контент", pricing: "Цены",
  careers: "Профессии", assessment: "Оценка", reports: "Отчёты", analytics: "Аналитика",
  audit: "Аудит-лог", system: "Система",
};

export function AdminConsole({ viewer, permissions }: Props) {
  const allowed = useMemo(() => NAV.filter(([, , permission]) => permissions.includes(permission)), [permissions]);
  const [section, setSection] = useState<string>(allowed[0]?.[1] ?? "overview");
  const visibleSection = allowed.some(([, id]) => id === section) ? section : (allowed[0]?.[1] ?? "overview");
  const groups = useMemo(() => [...new Set(allowed.map(([group]) => group))], [allowed]);
  const sectionTitle = NAV_RU[allowed.find(([, id]) => id === visibleSection)?.[0] ?? ""] ?? "Админ";
  return <div className={styles.shell}><aside className={styles.sidebar}><div className={styles.brand}><span className={styles.brandMark}>T</span><div><strong>T-Skills</strong><small>Панель управления</small></div></div><nav className={styles.navGroups}>{groups.map((group) => <div className={styles.navGroup} key={group}><span className={styles.navLabel}>{NAV_RU[group] ?? group}</span>{allowed.filter(([itemGroup]) => itemGroup === group).map(([, id]) => <button key={id} type="button" onClick={() => setSection(id)} className={`${styles.navItem} ${visibleSection === id ? styles.navActive : ""}`}><span className={styles.navBullet}>●</span>{NAV_RU[id] ?? id.replaceAll("-", " ")}</button>)}</div>)}</nav><div className={styles.sidebarFoot}><span className={styles.liveDot} /> Защищённая сессия<div>{viewer.email}</div></div></aside><main className={styles.main}><header className={styles.topbar}><div><span className={styles.kicker}>T-SKILLS / ADMIN</span><h1>{sectionTitle}</h1></div><div className={styles.identity}><span>{viewer.fullName || viewer.displayName || viewer.email}</span><span className={styles.avatar}>{(viewer.fullName || viewer.email).slice(0, 1).toUpperCase()}</span></div></header>{visibleSection === "overview" ? <Overview /> : null}{visibleSection === "orders" ? <Orders /> : null}{visibleSection === "promos" ? <Promos canCreate={permissions.includes("promos.create")} canUpdate={permissions.includes("promos.update")} canDisable={permissions.includes("promos.disable")} /> : null}{visibleSection === "campaigns" ? <Campaigns canManage={permissions.includes("campaigns.manage")} /> : null}{visibleSection === "entitlements" ? <Entitlements canGrant={permissions.includes("entitlements.grant")} canRevoke={permissions.includes("entitlements.revoke")} /> : null}{visibleSection === "users" ? <Users canSupport={permissions.includes("users.support_actions")} canBlock={permissions.includes("users.block")} canGrant={permissions.includes("entitlements.grant")} canRevoke={permissions.includes("entitlements.revoke")} /> : null}{visibleSection === "content" ? <CmsStudio permissions={permissions} /> : null}{visibleSection === "pricing" ? <Pricing canManage={permissions.includes("pricing.manage")} /> : null}{visibleSection === "careers" ? <Careers /> : null}{visibleSection === "assessment" ? <AssessmentSection permissions={permissions} /> : null}{visibleSection === "reports" ? <Reports canRetry={permissions.includes("reports.retry")} /> : null}{visibleSection === "analytics" ? <List title="Аналитика" endpoint="/api/admin/analytics?days=30" columns={["name", "count", "state", "duration"]} labels={{ name: "Название", count: "Количество", state: "Состояние", duration: "Длительность" }} /> : null}{visibleSection === "audit" ? <List title="Аудит-лог" endpoint="/api/admin/audit?limit=100" columns={["created_at", "actor_role", "action", "entity_type", "entity_id", "reason"]} labels={{ created_at: "Создан", actor_role: "Роль актора", action: "Действие", entity_type: "Тип сущности", entity_id: "ID сущности", reason: "Причина" }} /> : null}{visibleSection === "system" ? <System permissions={permissions} /> : null}</main></div>;
}

function Overview() {
  const resource = useResource("/api/admin/overview");
  const data = resource.data ?? {};
  const sales = (data.sales ?? {}) as JsonRecord;
  const users = (data.users ?? {}) as JsonRecord;
  const funnel = (data.funnel ?? {}) as JsonRecord;
  const health = (data.systemHealth ?? {}) as JsonRecord;

  return (
    <div className={styles.stack}>
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      <div className={styles.metricGrid}>
        <Metric label="Выручка 7 дней" value={sales.revenue7Days} />
        <Metric label="Оплаченные заказы" value={sales.paidOrders} />
        <Metric label="Пользователи" value={users.registered} />
        <Metric label="Отчёты" value={funnel.reportGenerated} />
      </div>
      <Panel title="Платёжные события и зарезервированная ёмкость" eyebrow="ОПЛАТЫ И WEBHOOK-ПОВТОРЫ">
        <div className={styles.metricGrid}>
          <Metric label="Промокоды ждут webhook после TTL" value={health.overduePromoReservations} />
          <Metric label="Места кампаний ждут webhook после TTL" value={health.overdueCampaignReservations} />
          <Metric label="Возвраты ждут подтверждения" value={health.pendingRefunds} />
          <Metric label="Ошибки возврата · 7 дней" value={health.failedRefunds} />
          <Metric label="Ошибки webhook · 7 дней" value={health.paymentWebhookErrors} />
          <Metric label="Ошибки отчётов" value={health.reportGenerationErrors} />
          <Metric label="Ошибки purge job" value={health.purgeJobErrors} />
          <Metric label="Ошибки входа · 7 дней" value={health.authFailures} />
        </div>
        <button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить состояние</button>
      </Panel>
      <Panel title="Воронка оценки" eyebrow="АГРЕГИРОВАННЫЕ ДАННЫЕ">
        <div className={styles.funnel}>
          {[{ key: "registered", label: "Зарегистрированы" }, { key: "entitled", label: "С доступом" }, { key: "started", label: "Начали" }, { key: "coreCompleted", label: "Ядро завершено" }, { key: "clarificationCompleted", label: "Уточнение завершено" }, { key: "reportGenerated", label: "Отчёты созданы" }].map(({ key, label }) => (
            <div key={key}><span>{label}</span><strong>{display(funnel[key])}</strong></div>
          ))}
        </div>
      </Panel>
      <Panel title="Версии оценки" eyebrow="НЕИЗМЕНЯЕМЫЙ РЕЕСТР">
        <Table data={records(data.assessmentVersions)} columns={["product_id", "version", "status", "scoring_version", "item_count"]} labels={{ product_id: "Продукт", version: "Версия", status: "Статус", scoring_version: "Версия скоринга", item_count: "Элементов" }} loading={resource.loading} />
      </Panel>
      <button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button>
    </div>
  );
}

// ─── P2.4 Orders ─────────────────────────────────────────────────────────────

function orderTimeline(order: JsonRecord, events: JsonRecord[], redemption: JsonRecord | null, entitlement: JsonRecord | null) {
  const steps: Array<{ label: string; detail: string; bad?: boolean }> = [];
  steps.push({ label: "Заказ создан", detail: `${formatDate(order.created_at)} · ${formatMoney(order.final_amount_minor ?? order.amount_minor, order.currency)}` });
  if (redemption && redemption.reserved_at !== null && redemption.reserved_at !== undefined) {
    steps.push({ label: "Промокод зарезервирован", detail: `${formatDate(redemption.reserved_at)} · истекает ${formatDate(redemption.reservation_expires_at)}` });
  }
  for (const event of events) {
    const type = String(event.event_type ?? "");
    const status = String(event.status ?? "");
    if (/checkout/i.test(type)) steps.push({ label: "Оформление создано", detail: `${str(event, "provider")} · ${formatDate(event.received_at)}` });
    else if (/confirm|success|succeed|paid/i.test(`${type} ${status}`)) steps.push({ label: "Оплата подтверждена", detail: `${str(event, "provider")} · ${formatDate(event.received_at)}` });
    else if (status === "REFUND_PENDING") steps.push({ label: "Возврат ожидает подтверждения", detail: `${type} · ${formatDate(event.received_at)}` });
    else if (status === "PARTIALLY_REFUNDED") steps.push({ label: "Возврат выполнен частично", detail: `${type} · ${formatDate(event.received_at)}` });
    else if (status === "REFUND_FAILED") steps.push({ label: "Возврат не выполнен", detail: `${type} · ${formatDate(event.received_at)}`, bad: true });
    else if (status === "REFUNDED") steps.push({ label: "Возврат выполнен", detail: `${type} · ${formatDate(event.received_at)}` });
    else if (/fail/i.test(`${type} ${status}`)) steps.push({ label: "Событие оплаты: неуспех", detail: `${type} · ${formatDate(event.received_at)}`, bad: true });
    else steps.push({ label: `Платёжное событие: ${type || status || "—"}`, detail: `${str(event, "provider")} · ${formatDate(event.received_at)}` });
  }
  const status = String(order.status ?? "");
  if (status === "PAYMENT_FAILED") steps.push({ label: "Оплата не удалась", detail: "Ветка отказа: заказ не оплачен.", bad: true });
  if (status === "REFUND_PENDING" && !events.some((event) => event.status === "REFUND_PENDING")) steps.push({ label: "Возврат ожидает подтверждения", detail: "Stripe принял запрос или ответ временно недоступен." });
  if (status === "REFUND_FAILED" && !events.some((event) => event.status === "REFUND_FAILED")) steps.push({ label: "Возврат не выполнен", detail: "Платёжный шлюз отклонил запрос; заказ можно проверить и повторить.", bad: true });
  if (status === "PARTIALLY_REFUNDED" && !events.some((event) => event.status === "PARTIALLY_REFUNDED")) steps.push({ label: "Возврат выполнен частично", detail: "Доступ сохраняется до полного возврата." });
  if (status === "REFUNDED" && !events.some((event) => event.status === "REFUNDED")) steps.push({ label: "Возврат выполнен", detail: "Доступ аннулирован, место в кампании освобождено." });
  if (redemption && (redemption.redeemed_at || String(redemption.status ?? "") === "REDEEMED")) {
    steps.push({ label: "Промокод погашен", detail: `${formatDate(redemption.redeemed_at)} · скидка ${formatMoney(redemption.discount_amount_minor, redemption.currency)}` });
  }
  if (redemption && (redemption.released_at || String(redemption.status ?? "") === "RELEASED")) {
    steps.push({ label: "Резервирование снято", detail: `${formatDate(redemption.released_at)} · срок резерва истёк, скидка освобождена.`, bad: status === "PAYMENT_FAILED" ? true : undefined });
  }
  if (entitlement && entitlement.created_at) {
    steps.push({ label: "Доступ выдан", detail: `${formatDate(entitlement.created_at)} · ${str(entitlement, "test_id")} · ${str(entitlement, "status")}` });
  }
  return steps;
}

function Orders() {
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const url = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    return `/api/admin/orders?${params.toString()}`;
  }, [search, status, page]);
  const resource = useResource(url);
  const rows = records(resource.data);
  const pagination = paginationOf(resource.data);
  const table = rows.map((row) => ({
    ...row,
    amounts: `${formatMoney(row.original_amount_minor, row.currency)} → ${formatMoney(row.final_amount_minor, row.currency)} (скидка ${formatMoney(row.discount_amount_minor, row.currency)})`,
    created: formatDate(row.created_at),
  }));
  return <div className={styles.stack}>
    <Panel title="Заказы" eyebrow="ПРОДАЖИ">
      <div className={styles.toolbar}><input placeholder="Поиск: order ID, user ID, email" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} aria-label="Поиск заказов" /><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Статус заказа"><option value="">Все статусы</option><option value="PENDING">PENDING</option><option value="PAID">PAID</option><option value="PAYMENT_FAILED">PAYMENT_FAILED</option><option value="REFUND_PENDING">REFUND_PENDING</option><option value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</option><option value="REFUND_FAILED">REFUND_FAILED</option><option value="REFUNDED">REFUNDED</option><option value="DISPUTED">DISPUTED</option><option value="DISPUTE_CLOSED">DISPUTE_CLOSED</option></select><button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></div>
      <div className={styles.formGrid}>
        <input placeholder="Order ID для возврата" value={refundOrderId} onChange={(e) => setRefundOrderId(e.target.value)} aria-label="Order ID для возврата" />
        <input placeholder="Причина возврата (reason)" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} aria-label="Причина возврата" />
        {refundOrderId.trim() ? (
          <Mutation
            label="Оформить возврат (Refund)"
            endpoint={`/api/admin/orders/${encodeURIComponent(refundOrderId.trim())}/refund`}
            payload={{ reason: refundReason }}
            confirmation="Оформить возврат по этому заказу? Доступ будет аннулирован после подтверждения полного возврата; при частичном возврате доступ сохранится."
            onDone={() => { setRefundOrderId(""); setRefundReason(""); resource.refresh(); }}
          />
        ) : null}
      </div>
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      <Table data={table} columns={["id", "email", "test_id", "amounts", "status", "created"]} labels={{ id: "ID", email: "Email", test_id: "Тест", amounts: "Суммы", status: "Статус", created: "Создан" }} onSelect={(row) => setSelectedId(str(row, "id"))} selectedId={selectedId} loading={resource.loading} />
      <p className={styles.actionHint}>Нажмите на строку, чтобы открыть карточку заказа с хронологией. Ручной ввод ID больше не нужен.</p>
      <Pager page={pagination.page} total={pagination.total} limit={PAGE_SIZE} hasNext={pagination.hasNext} onPage={setPage} />
    </Panel>
    {selectedId ? <OrderDetail orderId={selectedId} onClose={() => setSelectedId(null)} /> : null}
  </div>;
}

function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const resource = useResource(`/api/admin/orders/${encodeURIComponent(orderId)}`);
  const data = (resource.data ?? {}) as JsonRecord;
  const order = nested(data, "order");
  const events = nestedList(data, "timeline");
  const redemption = data.redemption && typeof data.redemption === "object" ? (data.redemption as JsonRecord) : null;
  const entitlement = data.entitlement && typeof data.entitlement === "object" ? (data.entitlement as JsonRecord) : null;
  const steps = orderTimeline(order, events, redemption, entitlement);
  return <DetailShell title={`Заказ ${orderId.slice(0, 18)}…`} eyebrow="КАРТОЧКА ЗАКАЗА" onClose={onClose}>
    {resource.loading ? <p className={styles.actionHint}>Загрузка…</p> : null}
    {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
    {!resource.loading && !resource.error && order.id ? <>
      <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Kv label="Заказ" value={str(order, "id")} />
        <Kv label="Пользователь" value={`${str(order, "email")} · ${str(order, "user_id")}`} />
        <Kv label="Тест" value={str(order, "test_id")} />
        <Kv label="Суммы" value={`${formatMoney(order.original_amount_minor, order.currency)} → ${formatMoney(order.final_amount_minor, order.currency)} (скидка ${formatMoney(order.discount_amount_minor, order.currency)})`} />
        <Kv label="Промокод" value={str(order, "promo_code_id", "—")} />
        <Kv label="Кампания" value={str(order, "campaign_id", "—")} />
        <Kv label="Провайдер" value={`${str(order, "provider")} · checkout ${str(order, "provider_checkout_id", "—")} · платёж ${str(order, "provider_payment_id", "—")}`} />
        <Kv label="Статус оплаты" value={<StatusPill value={order.status} />} />
        <Kv label="Создан / обновлён" value={`${formatDate(order.created_at)} / ${formatDate(order.updated_at)}`} />
      </div>
      <h3 style={{ fontSize: 13, margin: "6px 0 10px" }}>Хронология</h3>
      <div className={styles.health}>{steps.map((step, index) => <div key={index}><span className={step.bad ? styles.bad : styles.good}>{step.bad ? "✕" : "●"}</span><span><b>{step.label}</b><small style={{ display: "block", color: "#778a80" }}>{step.detail}</small></span></div>)}</div>
      {redemption ? <p className={styles.actionHint}>Погашение: {str(redemption, "id")} · статус {str(redemption, "status")} · заказ {str(redemption, "order_id", str(order, "id"))}.</p> : null}
      {entitlement ? <p className={styles.actionHint}>Доступ: {str(entitlement, "id")} · {str(entitlement, "grant_source")} · статус {str(entitlement, "status")}.</p> : null}
    </> : null}
  </DetailShell>;
}

// ─── P2.1 Promos ─────────────────────────────────────────────────────────────

type PromoFormValues = {
  code: string; name: string; description: string;
  discount_type: string; discount_value: string; currency: string;
  valid_from: string; valid_until: string;
  max_total_uses: string; max_uses_per_user: string; minimum_order_amount: string;
  new_users_only: boolean; allowed_test_ids: string; campaign_id: string; status: string;
};

function promoToForm(promo: JsonRecord): PromoFormValues {
  return {
    code: str(promo, "code", ""), name: str(promo, "name", ""), description: str(promo, "description", ""),
    discount_type: str(promo, "discountType", "PERCENT") || "PERCENT",
    discount_value: usageNum(promo.discountValue) === null ? "" : String(promo.discountValue),
    currency: str(promo, "currency", "KZT") || "KZT",
    valid_from: toDateTimeLocalInput(promo.validFrom), valid_until: toDateTimeLocalInput(promo.validUntil),
    max_total_uses: usageNum(promo.maxTotalUses) === null ? "" : String(promo.maxTotalUses),
    max_uses_per_user: usageNum(promo.maxUsesPerUser) === null ? "" : String(promo.maxUsesPerUser),
    minimum_order_amount: usageNum(promo.minimumOrderAmount) === null ? "" : String(promo.minimumOrderAmount),
    new_users_only: Boolean(promo.newUsersOnly),
    allowed_test_ids: Array.isArray(promo.allowedTestIds) ? (promo.allowedTestIds as unknown[]).map(String).join(", ") : "",
    campaign_id: str(promo, "campaignId", ""), status: str(promo, "status", "ACTIVE") || "ACTIVE",
  };
}

function emptyPromoForm(): PromoFormValues {
  return { code: "", name: "", description: "", discount_type: "PERCENT", discount_value: "10", currency: "KZT", valid_from: "", valid_until: "", max_total_uses: "", max_uses_per_user: "", minimum_order_amount: "", new_users_only: false, allowed_test_ids: "", campaign_id: "", status: "ACTIVE" };
}

function buildPromoPayload(form: PromoFormValues, isCreate: boolean): { ok: true; payload: JsonRecord } | { ok: false; error: string } {
  if (form.code.trim().length < 3) return { ok: false, error: "Код: минимум 3 символа." };
  if (!form.name.trim()) return { ok: false, error: "Название обязательно." };
  const discountValue = Number(form.discount_value);
  if (!Number.isInteger(discountValue) || discountValue < 0) return { ok: false, error: "Значение скидки: целое ≥ 0." };
  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) return { ok: false, error: "Валюта: 3 буквы (напр. KZT)." };
  const intOrNull = (raw: string, label: string) => {
    if (!raw.trim()) return { value: null as number | null };
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return { error: `${label}: целое ≥ 0.` };
    return { value: parsed };
  };
  const maxTotal = intOrNull(form.max_total_uses, "Макс. всего");
  if ("error" in maxTotal) return { ok: false, error: maxTotal.error as string };
  const maxPerUser = intOrNull(form.max_uses_per_user, "Макс. на пользователя");
  if ("error" in maxPerUser) return { ok: false, error: maxPerUser.error as string };
  const minOrder = intOrNull(form.minimum_order_amount, "Мин. заказ");
  if ("error" in minOrder) return { ok: false, error: minOrder.error as string };
  const payload: JsonRecord = {
    code: form.code.trim(), name: form.name.trim(), description: form.description.trim(),
    discount_type: form.discount_type, discount_value: discountValue, currency: form.currency.trim().toUpperCase(),
    max_total_uses: maxTotal.value, max_uses_per_user: maxPerUser.value,
    valid_from: parseDateTimeLocal(form.valid_from), valid_until: parseDateTimeLocal(form.valid_until),
    minimum_order_amount: minOrder.value, new_users_only: form.new_users_only,
    allowed_test_ids: form.allowed_test_ids.split(",").map((part) => part.trim()).filter(Boolean),
    campaign_id: form.campaign_id.trim() ? form.campaign_id.trim() : null,
  };
  if (!isCreate) payload.status = form.status;
  return { ok: true, payload };
}

function PromoForm({ initial, submitLabel, onSubmit, busy, serverError }: { initial: PromoFormValues; submitLabel: string; onSubmit: (payload: JsonRecord) => void; busy: boolean; serverError: string | null }) {
  const [form, setForm] = useState(initial);
  const [localError, setLocalError] = useState<string | null>(null);
  const set = (patch: Partial<PromoFormValues>) => setForm((prev) => ({ ...prev, ...patch }));
  function submit() {
    const built = buildPromoPayload(form, submitLabel === "Создать промокод");
    if (!built.ok) { setLocalError(built.error); return; }
    setLocalError(null);
    onSubmit(built.payload);
  }
  return <div className={styles.editor} style={{ maxWidth: "none" }}>
    <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      <input placeholder="Код (мин. 3 символа)" value={form.code} onChange={(e) => set({ code: e.target.value })} aria-label="Код" />
      <input placeholder="Название" value={form.name} onChange={(e) => set({ name: e.target.value })} aria-label="Название" />
      <input placeholder="Описание" value={form.description} onChange={(e) => set({ description: e.target.value })} aria-label="Описание" />
      <select value={form.discount_type} onChange={(e) => set({ discount_type: e.target.value })} aria-label="Тип скидки"><option value="PERCENT">PERCENT (%)</option><option value="FIXED_AMOUNT">FIXED_AMOUNT</option><option value="FREE_ACCESS">FREE_ACCESS</option></select>
      <input type="number" min={0} step={1} placeholder="Значение скидки" value={form.discount_value} onChange={(e) => set({ discount_value: e.target.value })} aria-label="Значение скидки" />
      <input placeholder="Валюта (KZT)" value={form.currency} onChange={(e) => set({ currency: e.target.value })} aria-label="Валюта" />
      <label className={styles.actionHint}>Действует с<input type="datetime-local" value={form.valid_from} onChange={(e) => set({ valid_from: e.target.value })} /></label>
      <label className={styles.actionHint}>Действует по<input type="datetime-local" value={form.valid_until} onChange={(e) => set({ valid_until: e.target.value })} /></label>
      <input type="number" min={0} placeholder="Макс. использований всего" value={form.max_total_uses} onChange={(e) => set({ max_total_uses: e.target.value })} aria-label="Макс. использований всего" />
      <input type="number" min={0} placeholder="Макс. на пользователя" value={form.max_uses_per_user} onChange={(e) => set({ max_uses_per_user: e.target.value })} aria-label="Макс. на пользователя" />
      <input type="number" min={0} placeholder="Мин. заказ (минор)" value={form.minimum_order_amount} onChange={(e) => set({ minimum_order_amount: e.target.value })} aria-label="Мин. заказ" />
      <input placeholder="Разрешённые тесты (через запятую)" value={form.allowed_test_ids} onChange={(e) => set({ allowed_test_ids: e.target.value })} aria-label="Разрешённые тесты" />
      <input placeholder="ID кампании (опц.)" value={form.campaign_id} onChange={(e) => set({ campaign_id: e.target.value })} aria-label="Кампания" />
      <label className={styles.actionHint} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={form.new_users_only} onChange={(e) => set({ new_users_only: e.target.checked })} /> только новые пользователи</label>
      {submitLabel === "Создать промокод" ? null : <select value={form.status} onChange={(e) => set({ status: e.target.value })} aria-label="Статус"><option value="ACTIVE">ACTIVE (включён)</option><option value="DRAFT">DRAFT</option><option value="DISABLED">DISABLED</option></select>}
    </div>
    {localError ? <p className={styles.error}>{localError}</p> : null}
    {serverError ? <p className={styles.error}>{serverError}</p> : null}
    <div><button type="button" className={styles.primaryButton} disabled={busy} onClick={submit}>{busy ? "Сохранение…" : submitLabel}</button></div>
  </div>;
}

function Promos({ canCreate, canUpdate, canDisable }: { canCreate: boolean; canUpdate: boolean; canDisable: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const url = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    return `/api/admin/promo-codes?${params.toString()}`;
  }, [search, status, page]);
  const resource = useResource(url);
  const rows = records(resource.data);
  const pagination = paginationOf(resource.data);
  const table = rows.map((row) => {
    const usage = nested(row, "usage");
    return {
      ...row,
      discount: formatDiscount(row),
      usage: display(usage.uses ?? row.uses ?? "—"),
      remaining: display(usage.remaining ?? "∞"),
      validity: formatValidity(row),
      campaign: str(row, "campaignId", "—"),
      created: formatDate(row.createdAt ?? row.created_at),
    };
  });
  async function create(payload: JsonRecord) {
    setCreateBusy(true);
    setCreateError(null);
    try {
      await apiJson("/api/admin/promo-codes", { method: "POST", body: JSON.stringify(payload) });
      setShowCreate(false);
      resource.refresh();
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Не удалось создать промокод.");
    } finally {
      setCreateBusy(false);
    }
  }
  return <div className={styles.stack}>
    <Panel title="Промокоды" eyebrow="RESERVED → REDEEMED / RELEASED" action={canCreate ? <button type="button" className={styles.primaryButton} onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Скрыть форму" : "+ Новый промокод"}</button> : null}>
      {showCreate && canCreate ? <PromoForm initial={emptyPromoForm()} submitLabel="Создать промокод" onSubmit={create} busy={createBusy} serverError={createError} /> : null}
      <div className={styles.toolbar}><input placeholder="Поиск: код, название" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} aria-label="Поиск промокодов" /><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Статус промокода"><option value="">Все статусы</option><option value="ACTIVE">ACTIVE</option><option value="DRAFT">DRAFT</option><option value="DISABLED">DISABLED</option><option value="EXPIRED">EXPIRED</option><option value="EXHAUSTED">EXHAUSTED</option></select><button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></div>
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      <Table data={table} columns={["code", "name", "discountType", "discount", "usage", "remaining", "validity", "campaign", "status", "created"]} labels={{ code: "Код", name: "Название", discountType: "Тип скидки", discount: "Скидка", usage: "Использовано", remaining: "Осталось", validity: "Срок действия", campaign: "Кампания", status: "Статус", created: "Создан" }} onSelect={(row) => setSelectedId(str(row, "id"))} selectedId={selectedId} loading={resource.loading} />
      <p className={styles.actionHint}>Нажмите на строку, чтобы открыть карточку: статистика, погашения, редактирование, отключение.</p>
      <Pager page={pagination.page} total={pagination.total} limit={PAGE_SIZE} hasNext={pagination.hasNext} onPage={setPage} />
    </Panel>
    {selectedId ? <PromoDetail promoId={selectedId} canUpdate={canUpdate} canDisable={canDisable} onClose={() => setSelectedId(null)} onChanged={resource.refresh} /> : null}
  </div>;
}

function PromoDetail({ promoId, canUpdate, canDisable, onClose, onChanged }: { promoId: string; canUpdate: boolean; canDisable: boolean; onClose: () => void; onChanged: () => void }) {
  const resource = useResource(`/api/admin/promo-codes/${encodeURIComponent(promoId)}`);
  const data = (resource.data ?? {}) as JsonRecord;
  const promo = nested(data, "promo");
  const hasPromo = promo.id !== undefined && promo.id !== null;
  const stats = nested(data, "stats");
  const redemptions = nestedList(data, "redemptions");
  const usage = nested(promo, "usage");
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  async function save(payload: JsonRecord) {
    setEditBusy(true);
    setEditError(null);
    try {
      const body = { ...payload, expected_updated_at: usageNum(promo.updatedAt) ?? undefined, reason: "Обновление условий промокода из admin-панели" };
      await apiJson(`/api/admin/promo-codes/${encodeURIComponent(promoId)}`, { method: "PATCH", body: JSON.stringify(body) });
      setEditing(false);
      resource.refresh();
      onChanged();
    } catch (reason) {
      setEditError(reason instanceof Error ? reason.message : "Не удалось сохранить.");
    } finally {
      setEditBusy(false);
    }
  }
  async function disable(reason: string) {
    setDisableBusy(true);
    setDisableError(null);
    try {
      await apiJson(`/api/admin/promo-codes/${encodeURIComponent(promoId)}`, { method: "PATCH", body: JSON.stringify({ status: "DISABLED", reason }) });
      setConfirmingDisable(false);
      resource.refresh();
      onChanged();
    } catch (reason_) {
      setDisableError(reason_ instanceof Error ? reason_.message : "Не удалось отключить.");
    } finally {
      setDisableBusy(false);
    }
  }
  const redemptionRows = redemptions.map((row) => ({
    ...row,
    user: str(row, "email", str(row, "user_id")),
    order: str(row, "order_id", "—"),
    original: formatMoney(row.original_amount_minor, row.currency),
    discount: formatMoney(row.discount_amount_minor, row.currency),
    final: formatMoney(row.final_amount_minor, row.currency),
    date: formatDate(row.redeemed_at ?? row.reserved_at),
  }));
  return <DetailShell title={hasPromo ? `Промокод ${str(promo, "code")}` : "Промокод"} eyebrow="КАРТОЧКА ПРОМОКОДА" onClose={onClose}>
    {resource.loading ? <p className={styles.actionHint}>Загрузка…</p> : null}
    {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
    {!resource.loading && !resource.error && hasPromo ? <>
      <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Kv label="Использований" value={display(stats.uses ?? usage.uses ?? 0)} />
        <Kv label="Осталось" value={display(usage.remaining ?? "∞")} />
        <Kv label="Выручка/скидки" value={formatMoney(stats.discountTotal, promo.currency)} />
        <Kv label="Статус" value={<StatusPill value={promo.status} />} />
      </div>
      <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Kv label="Название" value={str(promo, "name")} />
        <Kv label="Скидка" value={formatDiscount(promo)} />
        <Kv label="Кампания" value={str(promo, "campaignId", "—")} />
        <Kv label="Срок действия" value={formatValidity(promo)} />
        <Kv label="Лимиты" value={`всего ${display(promo.maxTotalUses ?? "∞")} · на пользователя ${display(promo.maxUsesPerUser ?? "∞")} · мин. заказ ${display(promo.minimumOrderAmount ?? "—")}`} />
        <Kv label="Флаги" value={`${promo.newUsersOnly ? "только новые" : "все пользователи"} · тесты: ${Array.isArray(promo.allowedTestIds) && (promo.allowedTestIds as unknown[]).length ? (promo.allowedTestIds as unknown[]).map(String).join(", ") : "все"}`} />
      </div>
      {promo.description ? <p className={styles.actionHint}>{str(promo, "description")}</p> : null}
      <h3 style={{ fontSize: 13, margin: "6px 0 10px" }}>Погашения ({redemptions.length})</h3>
      <Table data={redemptionRows} columns={["user", "order", "original", "discount", "final", "status", "date"]} labels={{ user: "Пользователь", order: "Заказ", original: "Исходная сумма", discount: "Скидка", final: "Итог", status: "Статус", date: "Дата" }} />
      {canUpdate && !editing ? <div className={styles.actionRow}><button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>Редактировать</button></div> : null}
      {canUpdate && editing ? <><h3 style={{ fontSize: 13, margin: "12px 0 10px" }}>Редактирование</h3><PromoForm key={`${promoId}-${String(promo.updatedAt ?? "")}`} initial={promoToForm(promo)} submitLabel="Сохранить" onSubmit={save} busy={editBusy} serverError={editError} /><div className={styles.actionRow}><button type="button" className={styles.secondaryButton} onClick={() => setEditing(false)}>Отменить редактирование</button></div></> : null}
      {canDisable && str(promo, "status") !== "DISABLED" && !confirmingDisable ? <div className={styles.actionRow}><button type="button" className={styles.secondaryButton} onClick={() => setConfirmingDisable(true)}>Отключить промокод</button></div> : null}
      {canDisable && confirmingDisable ? <ConfirmAction action="отключение промокода" consequence={`Код ${str(promo, "code")} перестанет приниматься. Уже выданные скидки сохранятся. Действие необратимо через UI (только повторное включение).`} onCancel={() => setConfirmingDisable(false)} onConfirm={disable} busy={disableBusy} error={disableError} /> : null}
    </> : null}
  </DetailShell>;
}

// ─── P2.2 Campaigns ──────────────────────────────────────────────────────────

function Campaigns({ canManage }: { canManage: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", client_name: "", client_type: "SCHOOL", seat_limit: "100", default_test_id: "t-skills" });
  const [edit, setEdit] = useState({ id: "", seat_limit: "", status: "ACTIVE", expected_updated_at: "", reason: "" });
  const updatePayload = {
    seat_limit: edit.seat_limit ? Number(edit.seat_limit) : undefined,
    status: edit.status || undefined,
    expected_updated_at: edit.expected_updated_at ? Number(edit.expected_updated_at) : undefined,
    reason: edit.reason || "Изменение параметров кампании",
  };
  const url = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    return `/api/admin/campaigns?${params.toString()}`;
  }, [search, status, page]);
  const resource = useResource(url);
  const rows = records(resource.data);
  const pagination = paginationOf(resource.data);
  const table = rows.map((row) => ({ ...row, remaining: display(row.unused), created: formatDate(row.created_at) }));
  return <div className={styles.stack}>
    <Panel title="B2B-кампании" eyebrow="КАМПАНИИ">
      {canManage ? <div className={styles.formGrid}><input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Название кампании" /><input placeholder="Клиент" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} aria-label="Клиент" /><select value={form.client_type} onChange={(e) => setForm({ ...form, client_type: e.target.value })} aria-label="Тип клиента"><option>SCHOOL</option><option>UNIVERSITY</option><option>COMPANY</option><option>PARTNER</option><option>OTHER</option></select><input type="number" value={form.seat_limit} onChange={(e) => setForm({ ...form, seat_limit: e.target.value })} aria-label="Лимит мест" /><Mutation label="Создать кампанию" endpoint="/api/admin/campaigns" payload={{ ...form, seat_limit: Number(form.seat_limit) }} onDone={resource.refresh} /></div> : null}
      {canManage ? <div className={styles.formGrid}><input placeholder="Campaign ID для обновления" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} aria-label="Campaign ID для обновления" /><input type="number" placeholder="Новый лимит мест" value={edit.seat_limit} onChange={(e) => setEdit({ ...edit, seat_limit: e.target.value })} aria-label="Новый лимит мест" /><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} aria-label="Новый статус кампании"><option>ACTIVE</option><option>DISABLED</option><option>ARCHIVED</option></select><input placeholder="Expected updated_at (ms)" value={edit.expected_updated_at} onChange={(e) => setEdit({ ...edit, expected_updated_at: e.target.value })} aria-label="Expected updated_at" /><input placeholder="Причина изменения" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} aria-label="Причина изменения" />{edit.id.trim() ? <Mutation label="Обновить кампанию" endpoint={`/api/admin/campaigns/${encodeURIComponent(edit.id.trim())}`} method="PATCH" payload={updatePayload} confirmation="Обновить параметры кампании?" onDone={resource.refresh} /> : null}</div> : null}
      <div className={styles.toolbar}><input placeholder="Поиск: название, клиент" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} aria-label="Поиск кампаний" /><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Статус кампании"><option value="">Все статусы</option><option value="ACTIVE">ACTIVE</option><option value="DISABLED">DISABLED</option><option value="ARCHIVED">ARCHIVED</option><option value="EXPIRED">EXPIRED</option></select><button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></div>
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      <Table data={table} columns={["name", "client_name", "client_type", "status", "seat_limit", "activated", "started", "completed", "remaining"]} labels={{ name: "Название", client_name: "Клиент", client_type: "Тип клиента", status: "Статус", seat_limit: "Лимит мест", activated: "Активировано", started: "Начали", completed: "Завершили", remaining: "Осталось" }} onSelect={(row) => setSelectedId(str(row, "id"))} selectedId={selectedId} loading={resource.loading} />
      <p className={styles.actionHint}>Нажмите на строку, чтобы открыть карточку: места, воронка, промокоды, архивация.</p>
      <Pager page={pagination.page} total={pagination.total} limit={PAGE_SIZE} hasNext={pagination.hasNext} onPage={setPage} />
    </Panel>
    {selectedId ? <CampaignDetail campaignId={selectedId} canManage={canManage} onClose={() => setSelectedId(null)} onChanged={resource.refresh} /> : null}
  </div>;
}

function CampaignDetail({ campaignId, canManage, onClose, onChanged }: { campaignId: string; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const resource = useResource(`/api/admin/campaigns/${encodeURIComponent(campaignId)}`);
  const data = (resource.data ?? {}) as JsonRecord;
  const campaign = nested(data, "campaign");
  const hasCampaign = campaign.id !== undefined && campaign.id !== null;
  const metrics = nested(data, "metrics");
  const promoCodes = nestedList(data, "promoCodes");
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const funnel = [
    { key: "Места", value: metrics.purchasedSeats ?? campaign.seat_limit },
    { key: "Активировано", value: metrics.activated },
    { key: "Начали", value: metrics.started },
    { key: "Завершили", value: metrics.completed },
    { key: "Отчёты", value: metrics.reportsGenerated },
  ];
  async function archive(reason: string) {
    setBusy(true);
    setActionError(null);
    try {
      await apiJson(`/api/admin/campaigns/${encodeURIComponent(campaignId)}`, { method: "PATCH", body: JSON.stringify({ status: "ARCHIVED", reason }) });
      setConfirmingArchive(false);
      resource.refresh();
      onChanged();
    } catch (reason_) {
      setActionError(reason_ instanceof Error ? reason_.message : "Не удалось архивировать.");
    } finally {
      setBusy(false);
    }
  }
  return <DetailShell title={hasCampaign ? str(campaign, "name") : "Кампания"} eyebrow="КАРТОЧКА КАМПАНИИ" onClose={onClose}>
    {resource.loading ? <p className={styles.actionHint}>Загрузка…</p> : null}
    {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
    {!resource.loading && !resource.error && hasCampaign ? <>
      <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Kv label="Клиент" value={`${str(campaign, "client_name")} · ${str(campaign, "client_type")}`} />
        <Kv label="Тест" value={str(campaign, "default_test_id")} />
        <Kv label="Статус" value={<StatusPill value={campaign.status} />} />
        <Kv label="Лимит мест" value={display(campaign.seat_limit)} />
        <Kv label="Использовано" value={display(metrics.activated ?? 0)} />
        <Kv label="Осталось" value={display(metrics.unused ?? 0)} />
        <Kv label="Старт" value={formatDate(campaign.valid_from)} />
        <Kv label="Финиш" value={formatDate(campaign.valid_until)} />
        <Kv label="Создана" value={formatDate(campaign.created_at)} />
      </div>
      <h3 style={{ fontSize: 13, margin: "6px 0 10px" }}>Воронка: Места → Активировано → Начали → Завершили → Отчёты</h3>
      <div className={styles.funnel} style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>{funnel.map((step) => <div key={step.key}><span>{step.key}</span><strong>{display(step.value ?? 0)}</strong></div>)}</div>
      <h3 style={{ fontSize: 13, margin: "14px 0 10px" }}>Связанные промокоды ({promoCodes.length})</h3>
      <Table data={promoCodes.map((promo) => ({ ...promo, discount: `${str(promo, "discount_type")} ${display(promo.discount_value)}` }))} columns={["code", "name", "discount", "status"]} labels={{ code: "Код", name: "Название", discount: "Скидка", status: "Статус" }} />
      {canManage && str(campaign, "status") !== "ARCHIVED" && !confirmingArchive ? <div className={styles.actionRow}><button type="button" className={styles.secondaryButton} onClick={() => setConfirmingArchive(true)}>Архивировать кампанию</button></div> : null}
      {canManage && confirmingArchive ? <ConfirmAction action="архивация кампании" consequence={`Кампания ${str(campaign, "name")} будет закрыта, новые активации мест станут невозможны. Участники сохранят доступ.`} onCancel={() => setConfirmingArchive(false)} onConfirm={archive} busy={busy} error={actionError} /> : null}
    </> : null}
  </DetailShell>;
}

// ─── P2.3 Users ──────────────────────────────────────────────────────────────

type SupportKind = "GRANT_ACCESS" | "REVOKE_ENTITLEMENT" | "ALLOW_RETAKE" | "BLOCK_ACCOUNT" | "UNBLOCK_ACCOUNT" | "FORCE_LOGOUT" | "RESEND_REPORT";

const SUPPORT_META: Record<SupportKind, { label: string; consequence: string }> = {
  GRANT_ACCESS: { label: "Выдать доступ", consequence: "Пользователь получит новый доступ на выбранный тест без Stripe-заказа." },
  REVOKE_ENTITLEMENT: { label: "Отозвать доступ", consequence: "Выбранный доступ станет REVOKED, доступ будет закрыт." },
  ALLOW_RETAKE: { label: "Разрешить пересдачу", consequence: "Будет выдан новый доступ для повторного прохождения." },
  BLOCK_ACCOUNT: { label: "Заблокировать", consequence: "Учётная запись будет заблокирована, вход станет невозможен." },
  UNBLOCK_ACCOUNT: { label: "Разблокировать", consequence: "Учётная запись будет разблокирована." },
  FORCE_LOGOUT: { label: "Завершить сессии", consequence: "Все активные сессии пользователя будут отозваны." },
  RESEND_REPORT: { label: "Отправить отчёт повторно", consequence: "Будет запрошена повторная отправка отчёта (требуется настроенная email-очередь)." },
};

function Users({ canSupport, canBlock, canGrant, canRevoke }: { canSupport: boolean; canBlock: boolean; canGrant: boolean; canRevoke: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const url = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    return `/api/admin/users?${params.toString()}`;
  }, [search, page]);
  const resource = useResource(url);
  const rows = records(resource.data);
  const pagination = paginationOf(resource.data);
  const table = rows.map((row) => ({ ...row, name: str(row, "full_name", "—"), activity: formatDate(row.last_activity) }));
  return <div className={styles.stack}>
    <Panel title="Пользователи и поддержка" eyebrow="ПОЛЬЗОВАТЕЛИ">
      <div className={styles.toolbar}><input placeholder="Email, ID, имя" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} aria-label="Поиск пользователей" /><button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></div>
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      <Table data={table} columns={["id", "email", "name", "status", "entitlements", "assessments", "activity"]} labels={{ id: "ID", email: "Email", name: "Имя", status: "Статус", entitlements: "Доступы", assessments: "Прохождения", activity: "Активность" }} onSelect={(row) => setSelectedId(str(row, "id"))} selectedId={selectedId} loading={resource.loading} />
      <p className={styles.actionHint}>Нажмите на строку, чтобы открыть карточку: аккаунт, доступ, заказы, прохождения, действия поддержки.</p>
      <Pager page={pagination.page} total={pagination.total} limit={PAGE_SIZE} hasNext={pagination.hasNext} onPage={setPage} />
    </Panel>
    {selectedId ? <UserDetail userId={selectedId} canSupport={canSupport} canBlock={canBlock} canGrant={canGrant} canRevoke={canRevoke} onClose={() => setSelectedId(null)} onChanged={resource.refresh} /> : null}
  </div>;
}

function UserDetail({ userId, canSupport, canBlock, canGrant, canRevoke, onClose, onChanged }: { userId: string; canSupport: boolean; canBlock: boolean; canGrant: boolean; canRevoke: boolean; onClose: () => void; onChanged: () => void }) {
  const resource = useResource(`/api/admin/users/${encodeURIComponent(userId)}`);
  const data = (resource.data ?? {}) as JsonRecord;
  const user = nested(data, "user");
  const hasUser = user.id !== undefined && user.id !== null;
  const entitlements = nestedList(data, "entitlements");
  const orders = nestedList(data, "orders");
  const assessments = nestedList(data, "assessments");
  const privacy = nestedList(data, "privacy");
  const [pending, setPending] = useState<SupportKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [testId, setTestId] = useState("t-skills");
  const [entitlementId, setEntitlementId] = useState("");
  const activeEntitlements = entitlements.filter((row) => String(row.status) === "ACTIVE");

  function allowedFor(kind: SupportKind) {
    if (kind === "BLOCK_ACCOUNT" || kind === "UNBLOCK_ACCOUNT") return canBlock;
    if (kind === "GRANT_ACCESS" || kind === "ALLOW_RETAKE") return canGrant;
    if (kind === "REVOKE_ENTITLEMENT") return canRevoke;
    return canSupport;
  }

  async function run(kind: SupportKind, reason: string) {
    setBusy(true);
    setActionError(null);
    setActionDone(null);
    try {
      const body: JsonRecord = { action: kind, reason: reason || undefined };
      if (kind === "GRANT_ACCESS" || kind === "ALLOW_RETAKE") body.grant = { test_id: testId.trim() || "t-skills", reason };
      if (kind === "REVOKE_ENTITLEMENT") {
        if (!entitlementId) throw new Error("Выберите доступ для отзыва.");
        body.entitlement_id = entitlementId;
      }
      const result = await apiJson<JsonRecord>(`/api/admin/users/${encodeURIComponent(userId)}/support`, { method: "POST", body: JSON.stringify(body) });
      const message = result.message ? ` · ${String(result.message)}` : "";
      setActionDone(`${SUPPORT_META[kind].label}: выполнено${message}`);
      setPending(null);
      resource.refresh();
      onChanged();
    } catch (reason_) {
      setActionError(reason_ instanceof Error ? reason_.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  }

  const kinds: SupportKind[] = ["GRANT_ACCESS", "REVOKE_ENTITLEMENT", "ALLOW_RETAKE", "BLOCK_ACCOUNT", "UNBLOCK_ACCOUNT", "FORCE_LOGOUT", "RESEND_REPORT"];
  return <DetailShell title={hasUser ? str(user, "email") : "Пользователь"} eyebrow="КАРТОЧКА ПОЛЬЗОВАТЕЛЯ" onClose={onClose}>
    {resource.loading ? <p className={styles.actionHint}>Загрузка…</p> : null}
    {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
    {!resource.loading && !resource.error && hasUser ? <>
      <h3 style={{ fontSize: 13, margin: "0 0 10px" }}>Аккаунт</h3>
      <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Kv label="ID" value={str(user, "id")} />
        <Kv label="Имя" value={str(user, "full_name", "—")} />
        <Kv label="Роль / локаль" value={`${str(user, "role", "—")} · ${str(user, "locale", "—")}`} />
        <Kv label="Статус" value={<StatusPill value={user.status} />} />
        <Kv label="Создан" value={formatDate(user.created_at)} />
        <Kv label="Обновлён" value={formatDate(user.updated_at)} />
      </div>
      <h3 style={{ fontSize: 13, margin: "6px 0 10px" }}>Доступы ({entitlements.length})</h3>
      <Table data={entitlements.map((row) => ({ ...row, created: formatDate(row.created_at), revoked: formatDate(row.revoked_at) }))} columns={["id", "test_id", "grant_source", "status", "created", "revoked"]} labels={{ id: "ID", test_id: "Тест", grant_source: "Источник", status: "Статус", created: "Создан", revoked: "Отозван" }} />
      <h3 style={{ fontSize: 13, margin: "14px 0 10px" }}>Заказы ({orders.length})</h3>
      <Table data={orders.map((row) => ({ ...row, amounts: `${formatMoney(row.original_amount_minor, row.currency)} → ${formatMoney(row.final_amount_minor, row.currency)}`, created: formatDate(row.created_at) }))} columns={["id", "test_id", "amounts", "status", "created"]} labels={{ id: "ID", test_id: "Тест", amounts: "Суммы", status: "Статус", created: "Создан" }} />
      <h3 style={{ fontSize: 13, margin: "14px 0 10px" }}>Прохождения ({assessments.length})</h3>
      <Table data={assessments.map((row) => ({ ...row, created: formatDate(row.created_at), completed: formatDate(row.completed_at) }))} columns={["id", "test_id", "state", "created", "completed"]} labels={{ id: "ID", test_id: "Тест", state: "Состояние", created: "Создан", completed: "Завершён" }} />
      <h3 style={{ fontSize: 13, margin: "14px 0 10px" }}>Действия поддержки</h3>
      {actionDone ? <p className={styles.notice}>{actionDone}</p> : null}
      {(pending === "GRANT_ACCESS" || pending === "ALLOW_RETAKE") && allowedFor(pending) ? <div className={styles.inlineFields}><input value={testId} onChange={(e) => setTestId(e.target.value)} placeholder="ID теста" aria-label="ID теста" /></div> : null}
      {pending === "REVOKE_ENTITLEMENT" ? <div className={styles.inlineFields}><select value={entitlementId} onChange={(e) => setEntitlementId(e.target.value)} aria-label="Доступ для отзыва"><option value="">Выберите доступ…</option>{activeEntitlements.map((row) => <option key={str(row, "id")} value={str(row, "id")}>{str(row, "id")} · {str(row, "test_id")} · {str(row, "grant_source")}</option>)}</select></div> : null}
      {pending ? <ConfirmAction action={SUPPORT_META[pending].label} consequence={SUPPORT_META[pending].consequence} onCancel={() => { setPending(null); setActionError(null); }} onConfirm={(reason) => run(pending, reason)} busy={busy} error={actionError} /> : <div className={styles.actionRow}>{kinds.filter(allowedFor).map((kind) => <button key={kind} type="button" className={styles.secondaryButton} disabled={kind === "REVOKE_ENTITLEMENT" && !activeEntitlements.length} title={kind === "REVOKE_ENTITLEMENT" && !activeEntitlements.length ? "Нет активных доступов" : SUPPORT_META[kind].consequence} onClick={() => { setPending(kind); setActionError(null); setActionDone(null); if (kind === "REVOKE_ENTITLEMENT" && activeEntitlements.length === 1) setEntitlementId(str(activeEntitlements[0], "id")); }}>{SUPPORT_META[kind].label}</button>)}</div>}
      {!kinds.some(allowedFor) ? <p className={styles.actionHint}>Нет прав на support-действия (нужны users.support_actions / users.block / entitlements.grant / entitlements.revoke).</p> : null}
      <h3 style={{ fontSize: 13, margin: "14px 0 10px" }}>Аудит и приватность</h3>
      {privacy.length ? <Table data={privacy.map((row) => ({ ...row, created: formatDate(row.created_at), completed: formatDate(row.completed_at) }))} columns={["id", "type", "status", "created", "completed"]} labels={{ id: "ID", type: "Тип", status: "Статус", created: "Создан", completed: "Завершён" }} /> : <p className={styles.actionHint}>Запросов на приватность нет. Полный аудит — в разделе «Аудит-лог».</p>}
    </> : null}
  </DetailShell>;
}

// ─── Entitlements ────────────────────────────────────────────────────────────

function Entitlements({ canGrant, canRevoke }: { canGrant: boolean; canRevoke: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchInput);
  const [selected, setSelected] = useState<JsonRecord | null>(null);
  const [form, setForm] = useState({ userId: "", test_id: "t-skills", reason: "", campaign_id: "" });
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const url = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    return `/api/admin/entitlements?${params.toString()}`;
  }, [search, status, page]);
  const resource = useResource(url);
  const rows = records(resource.data);
  const pagination = paginationOf(resource.data);
  const table = rows.map((row) => ({ ...row, created: formatDate(row.created_at) }));
  async function revoke(reason: string) {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiJson(`/api/admin/users/${encodeURIComponent(str(selected, "user_id"))}/support`, { method: "POST", body: JSON.stringify({ action: "REVOKE_ENTITLEMENT", entitlement_id: str(selected, "id"), reason }) });
      setConfirmingRevoke(false);
      setSelected(null);
      resource.refresh();
    } catch (reason_) {
      setActionError(reason_ instanceof Error ? reason_.message : "Не удалось отозвать доступ.");
    } finally {
      setBusy(false);
    }
  }
  return <div className={styles.stack}>
    <Panel title="Доступы вручную" eyebrow="ДОСТУПЫ">
      {canGrant ? <div className={styles.formGrid}><input placeholder="ID пользователя" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} aria-label="ID пользователя" /><input placeholder="Тест" value={form.test_id} onChange={(e) => setForm({ ...form, test_id: e.target.value })} aria-label="Тест" /><input placeholder="ID кампании (опц.)" value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })} aria-label="Кампания" /><input placeholder="Причина" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} aria-label="Причина" />{form.userId && form.reason ? <Mutation label="Выдать доступ" endpoint={`/api/admin/users/${encodeURIComponent(form.userId)}/grant`} payload={{ test_id: form.test_id, reason: form.reason, campaign_id: form.campaign_id || null }} confirmation="Выдать новый доступ без Stripe-заказа?" onDone={resource.refresh} /> : null}</div> : <p className={styles.actionHint}>Выдача доступа требует entitlements.grant.</p>}
      <div className={styles.toolbar}><input placeholder="Поиск: entitlement ID, user ID, email" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} aria-label="Поиск entitlements" /><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Статус entitlement"><option value="">Все статусы</option><option value="ACTIVE">ACTIVE</option><option value="REVOKED">REVOKED</option><option value="EXPIRED">EXPIRED</option></select><button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></div>
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      <Table data={table} columns={["id", "email", "test_id", "grant_source", "status", "created"]} labels={{ id: "ID", email: "Email", test_id: "Тест", grant_source: "Источник", status: "Статус", created: "Создан" }} onSelect={(row) => { setSelected(row); setConfirmingRevoke(false); setActionError(null); }} selectedId={selected ? str(selected, "id") : null} loading={resource.loading} />
      <Pager page={pagination.page} total={pagination.total} limit={PAGE_SIZE} hasNext={pagination.hasNext} onPage={setPage} />
    </Panel>
    {selected ? <DetailShell title={`Доступ ${str(selected, "id").slice(0, 18)}…`} eyebrow="ДОСТУП" onClose={() => { setSelected(null); setConfirmingRevoke(false); }}>
      <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Kv label="Пользователь" value={`${str(selected, "email")} · ${str(selected, "user_id")}`} />
        <Kv label="Тест" value={str(selected, "test_id")} />
        <Kv label="Источник" value={`${str(selected, "grant_source")} · ${str(selected, "grant_reference", "—")}`} />
        <Kv label="Промокод / кампания" value={`${str(selected, "promo_code_id", "—")} / ${str(selected, "campaign_id", "—")}`} />
        <Kv label="Статус" value={<StatusPill value={selected.status} />} />
        <Kv label="Создан / отозван" value={`${formatDate(selected.created_at)} / ${formatDate(selected.revoked_at)}`} />
      </div>
      {canRevoke && String(selected.status) === "ACTIVE" && !confirmingRevoke ? <div className={styles.actionRow}><button type="button" className={styles.secondaryButton} onClick={() => setConfirmingRevoke(true)}>Отозвать доступ</button></div> : null}
      {canRevoke && confirmingRevoke ? <ConfirmAction action="отзыв доступа" consequence={`Доступ ${str(selected, "id")} станет REVOKED, пользователь ${str(selected, "email")} потеряет доступ к ${str(selected, "test_id")}.`} onCancel={() => setConfirmingRevoke(false)} onConfirm={revoke} busy={busy} error={actionError} /> : null}
    </DetailShell> : null}
  </div>;
}

function AssessmentSection({ permissions }: { permissions: string[] }) {
  return <div className={styles.stack}><AssessmentSafety permissions={permissions} /><Assessment /></div>;
}

function Reports({ canRetry }: { canRetry: boolean }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<JsonRecord | null>(null);
  const url = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (status) params.set("status", status);
    return `/api/admin/reports?${params.toString()}`;
  }, [status, page]);
  const resource = useResource(url);
  const rows = records(resource.data);
  const pagination = paginationOf(resource.data);
  const table = rows.map((row) => ({ ...row, report: str(row, "id"), user: str(row, "user_id"), updated: formatDate(row.updated_at) }));
  const retryable = selected !== null && str(selected, "status", "") === "REPORT_FAILED_RETRYABLE";
  return <div className={styles.stack}>
    <Panel title="Отчёты" eyebrow="ЦЕПОЧКА ВЕРСИЙ + ПОВТОР">
      <div className={styles.toolbar}><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Статус отчёта"><option value="">Все статусы</option><option value="REPORT_READY">READY</option><option value="REPORT_GENERATING">GENERATING</option><option value="REPORT_FAILED_RETRYABLE">FAILED_RETRYABLE</option><option value="REPORT_FAILED">FAILED</option></select><button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button></div>
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      <Table data={table} columns={["report", "assessment_id", "user", "status", "provider", "model_id", "updated"]} labels={{ report: "Отчёт", assessment_id: "ID оценки", user: "Пользователь", status: "Статус", provider: "Провайдер", model_id: "ID модели", updated: "Обновлён" }} onSelect={(row) => setSelected(row)} selectedId={selected ? str(selected, "id") : null} loading={resource.loading} />
      <p className={styles.actionHint}>Нажмите на строку, чтобы увидеть цепочку версий отчёта.</p>
      <Pager page={pagination.page} total={pagination.total} limit={PAGE_SIZE} hasNext={pagination.hasNext} onPage={setPage} />
    </Panel>
    {selected ? <DetailShell title={`Отчёт ${str(selected, "id")}`} eyebrow="КАРТОЧКА ОТЧЁТА" onClose={() => setSelected(null)}>
      <ReportVersions report={selected} />
      {canRetry && retryable ? <div className={styles.actionRow}><Mutation label="Повторить генерацию" endpoint={`/api/admin/reports/${encodeURIComponent(str(selected, "id"))}/retry`} payload={{}} confirmation="Поставить отчёт в очередь на повторную генерацию?" onDone={resource.refresh} /></div> : null}
      {retryable && !canRetry ? <p className={styles.actionHint}>Повтор требует reports.retry.</p> : null}
    </DetailShell> : null}
  </div>;
}

function Pricing({ canManage }: { canManage: boolean }) {
  const resource = useResource("/api/admin/pricing");
  const [form, setForm] = useState({ test_id: "t-skills", name: "T-Skills", amount_minor: "150000", currency: "KZT", reason: "" });
  const current = records(resource.data).find((row) => row.test_id === form.test_id);
  const expectedUpdatedAt = usageNum(current?.updated_at) ?? 0;
  return <div className={styles.stack}><Panel title="Реестр цен" eyebrow="СНИМКИ ЗАКАЗОВ">{canManage ? <div className={styles.formGrid}><input value={form.test_id} onChange={(e) => setForm({ ...form, test_id: e.target.value })} aria-label="ID теста" /><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Название" /><input type="number" value={form.amount_minor} onChange={(e) => setForm({ ...form, amount_minor: e.target.value })} aria-label="Сумма (минор)" /><input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} aria-label="Валюта" /><input placeholder="Причина" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} aria-label="Причина" />{form.reason ? <Mutation label="Сохранить цену" endpoint="/api/admin/pricing" method="PATCH" payload={{ ...form, amount_minor: Number(form.amount_minor), expected_updated_at: expectedUpdatedAt }} confirmation="Изменить цену только для новых заказов?" onDone={resource.refresh} /> : null}</div> : <p className={styles.actionHint}>Доступ только к просмотру цен. Изменение требует pricing.manage.</p>}<Table data={records(resource.data)} columns={["test_id", "name", "amount_minor", "currency", "updated_at", "versions"]} labels={{ test_id: "Тест", name: "Название", amount_minor: "Сумма (минор)", currency: "Валюта", updated_at: "Обновлён", versions: "Версии" }} loading={resource.loading} /></Panel></div>;
}

const CAREER_FIELD_RU: Record<string, string> = {
  catalog_version: "Версия каталога", slug: "Слаг", title_ru: "Название (RU)", title_kk: "Название (KK)",
  description_ru: "Описание (RU)", description_kk: "Описание (KK)", category: "Категория", source_version: "Версия источника",
};

const ASSESSMENT_FIELD_RU: Record<string, string> = {
  product_id: "ID продукта", version: "Версия", scoring_version: "Версия скоринга", content_version: "Версия контента",
  career_model_version: "Версия карьерной модели", report_version: "Версия отчёта", adaptive_version: "Версия адаптива", item_count: "Число элементов",
};

function Careers() {
  const resource = useResource("/api/admin/careers?limit=100");
  const [form, setForm] = useState({ catalog_version: "t-skills-career-catalog-v1", slug: "", title_ru: "", title_kk: "", description_ru: "", description_kk: "", category: "", source_version: "editorial-v1" });
  const [version, setVersion] = useState("");
  const [reason, setReason] = useState("");
  return <div className={styles.stack}><Panel title="Каталог профессий" eyebrow="ТОЛЬКО КОНТЕНТ"><p className={styles.actionHint}>Профессии редактируются отдельно от неизменяемой модели сопоставления.</p><div className={styles.formGrid}>{Object.entries(form).map(([key, value]) => <input key={key} placeholder={CAREER_FIELD_RU[key] ?? key} value={value} onChange={(e) => setForm({ ...form, [key]: e.target.value })} aria-label={CAREER_FIELD_RU[key] ?? key} />)}<Mutation label="Сохранить черновик" endpoint="/api/admin/careers" payload={form} onDone={resource.refresh} /></div><div className={styles.inlineFields}><input placeholder="Версия каталога" value={version} onChange={(e) => setVersion(e.target.value)} aria-label="Версия каталога" /><input placeholder="Причина" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Причина" />{version ? <Mutation label="Опубликовать каталог" endpoint="/api/admin/careers/publish" payload={{ version, reason: reason || "Публикация каталога" }} confirmation="Опубликовать неизменяемую версию каталога?" onDone={resource.refresh} /> : null}</div><Table data={records(resource.data)} columns={["catalog_version", "slug", "title_ru", "title_kk", "category", "status"]} labels={{ catalog_version: "Версия каталога", slug: "Слаг", title_ru: "Название RU", title_kk: "Название KK", category: "Категория", status: "Статус" }} loading={resource.loading} /></Panel></div>;
}

function Assessment() {
  const resource = useResource("/api/admin/assessment/versions");
  const [form, setForm] = useState({ product_id: "t-skills", version: "", scoring_version: "pairwise-scoring-v1", content_version: "t-skills-pairwise-items-v1", career_model_version: "career-matching-v1", report_version: "t-skills-report-v1", adaptive_version: "career-adaptive-v1", item_count: "75" });
  const [id, setId] = useState("");
  return <div className={styles.stack}><Panel title="Реестр оценок" eyebrow="ИСПОЛНЯЕМЫЙ РАНТАЙМ ОБЯЗАТЕЛЕН"><div className={styles.formGrid}>{Object.entries(form).map(([key, value]) => <input key={key} placeholder={ASSESSMENT_FIELD_RU[key] ?? key} value={value} onChange={(e) => setForm({ ...form, [key]: e.target.value })} aria-label={ASSESSMENT_FIELD_RU[key] ?? key} />)}<Mutation label="Создать черновик" endpoint="/api/admin/assessment/versions" payload={{ ...form, item_count: Number(form.item_count) }} onDone={resource.refresh} /></div><div className={styles.inlineFields}><input placeholder="ID версии" value={id} onChange={(e) => setId(e.target.value)} aria-label="ID версии" />{id ? <Mutation label="Опубликовать" endpoint={`/api/admin/assessment/versions/${encodeURIComponent(id)}/publish`} payload={{ reason: "Публикация версии оценки" }} confirmation="Публикация проверит банк заданий, скоринг, адаптив и рантайм отчётов. Продолжить?" onDone={resource.refresh} /> : null}</div><Table data={records(resource.data)} columns={["id", "version", "status", "scoring_version", "career_model_version", "item_count", "published_at"]} labels={{ id: "ID", version: "Версия", status: "Статус", scoring_version: "Версия скоринга", career_model_version: "Версия карьерной модели", item_count: "Число элементов", published_at: "Опубликован" }} loading={resource.loading} /></Panel></div>;
}

function System({ permissions }: { permissions: string[] }) {
  const features = useResource("/api/admin/features");
  const [reason, setReason] = useState("");
  return <div className={styles.stack}><Panel title="Функциональные флаги" eyebrow="РАЗРЕШЁННЫЙ СПИСОК"><p className={styles.actionHint}>payments_enabled и maintenance_mode подключены к рантайму. Неиспользуемый t_skills_v5_enabled удалён из UI.</p><input placeholder="Причина изменения" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Причина изменения" />{records(features.data).map((flag) => reason ? <div className={styles.flag} key={String(flag.key)}><span><b>{display(flag.key)}</b><small>{display(flag.description)}</small></span><Mutation label={Boolean(flag.enabled) ? "ВКЛ" : "ВЫКЛ"} endpoint="/api/admin/features" method="PATCH" payload={{ key: flag.key, enabled: !Boolean(flag.enabled), reason }} confirmation={`Переключить ${display(flag.key)}?`} onDone={features.refresh} /></div> : null)}<Table data={records(features.data)} columns={["key", "enabled", "description", "updated_at"]} labels={{ key: "Ключ", enabled: "Включён", description: "Описание", updated_at: "Обновлён" }} loading={features.loading} /></Panel><SystemSettingsPanel permissions={permissions} /><SystemAccess permissions={permissions} /></div>;
}
