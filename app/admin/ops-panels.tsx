"use client";

import { useState } from "react";

import styles from "./admin-console.module.css";
import {
  ConfirmAction,
  Kv,
  Panel,
  StatusPill,
  apiJson,
  display,
  formatDate,
  nested,
  records,
  str,
  useResource,
  type JsonRecord,
} from "./ui-kit";

/**
 * P2.13 — ops panels. Read-only version chains plus publish-safety and
 * settings editors. All data comes from existing admin endpoints; no raw
 * answers are rendered anywhere (only version identifiers and statuses).
 */

/** Version chain for one report row from GET /api/admin/reports. */
export function ReportVersions({ report }: { report: JsonRecord }) {
  const versions = nested(report, "versions");
  return (
    <Panel title="Цепочка версий отчёта" eyebrow="VERSIONS_JSON + СТРОКА ОТЧЁТА">
      <div className={styles.inlineFields}>
        <Kv label="ID отчёта" value={str(report, "id")} />
        <Kv label="Статус" value={<StatusPill value={report.status} />} />
        <Kv label="Провайдер" value={str(report, "provider")} />
        <Kv label="Модель" value={str(report, "model_id")} />
        <Kv label="версия промпта" value={str(report, "prompt_version")} />
        <Kv label="Ошибка" value={str(report, "error_code", "—")} />
        <Kv label="Обновлён" value={formatDate(report.updated_at)} />
      </div>
      <div className={styles.inlineFields}>
        <Kv label="оценка" value={str(versions, "assessment")} />
        <Kv label="скоринг" value={str(versions, "scoring")} />
        <Kv label="банк заданий" value={str(versions, "itemBank")} />
        <Kv label="адаптив" value={str(versions, "adaptive")} />
        <Kv label="модель профессий" value={str(versions, "careerMatching")} />
        <Kv label="отчёт" value={str(versions, "report")} />
        <Kv label="селектор" value={str(versions, "selector")} />
      </div>
      <p className={styles.actionHint}>Оценка {str(report, "assessment_id")} · пользователь {str(report, "user_id")}</p>
    </Panel>
  );
}

function safetyOf(row: JsonRecord): string {
  const status = str(row, "status", "");
  if (status === "PUBLISHED") return "Опубликована";
  if (status === "RETIRED" || status === "ARCHIVED") return "Выведена";
  if (row.publishable === true) return status === "REVIEW" ? "Готова к проверке" : "Можно публиковать";
  if (row.publishable === false) return "Рантайм недоступен";
  return "Черновик";
}

/** Publish-safety table for GET /api/admin/assessment/versions rows. */
export function AssessmentSafety({ permissions }: { permissions: string[] }) {
  const resource = useResource("/api/admin/assessment/versions");
  const rows = records(resource.data);
  const canPublish = permissions.includes("assessment.publish");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish(id: string, reason: string) {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/admin/assessment/versions/${encodeURIComponent(id)}/publish`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setConfirmId(null);
      resource.refresh();
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "Не удалось опубликовать версию.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Безопасность публикации оценки" eyebrow="ТРЕБУЕТСЯ ИСПОЛНЯЕМЫЙ РАНТАЙМ">
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      {!canPublish ? <p className={styles.actionHint}>Публикация требует assessment.publish. Таблица доступна для чтения.</p> : null}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr><th>Версия</th><th>Безопасность</th><th>Причина блокировки</th><th>Завершено</th><th>Опубликовано</th><th>Действие</th></tr>
          </thead>
          <tbody>
            {resource.loading ? <tr><td colSpan={6}>Загрузка…</td></tr> : rows.length ? rows.map((row) => {
              const id = str(row, "id", "");
              const safety = safetyOf(row);
              const publishable = row.publishable === true;
              const blockReason = row.publishBlockReason === null || row.publishBlockReason === undefined ? "—" : String(row.publishBlockReason);
              return (
                <tr key={id || str(row, "version")}>
                  <td title={display(row.version)}>{display(row.version)}</td>
                  <td><StatusPill value={safety} /></td>
                  <td title={blockReason}>{blockReason}</td>
                  <td>{display(row.completed_assessments)}</td>
                  <td>{formatDate(row.published_at)}</td>
                  <td>
                    {!publishable ? (
                      <span className={styles.actionHint}>Публикация недоступна: {blockReason}</span>
                    ) : !canPublish ? (
                      <span className={styles.actionHint}>Нет права assessment.publish</span>
                    ) : confirmId === id ? (
                      <ConfirmAction
                        action={`Опубликовать ${str(row, "version")}`}
                        consequence="Версия станет исполняемой для новых сессий; предыдущая PUBLISHED уйдёт в RETIRED."
                        onCancel={() => setConfirmId(null)}
                        onConfirm={(reason) => void publish(id, reason)}
                        busy={busy}
                        error={error}
                      />
                    ) : (
                      <button type="button" className={styles.secondaryButton} onClick={() => { setConfirmId(id); setError(null); }}>
                        Опубликовать
                      </button>
                    )}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={6}>Нет данных</td></tr>}
          </tbody>
        </table>
      </div>
      <button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button>
    </Panel>
  );
}

const SETTING_WIRING: Record<string, string> = {
  checkout_enabled: "Подключено → шлюз оформления: createCheckout (payment-provider) + createPendingOrder (durable-store) + catalog availableForCheckout",
  maintenance_message: "Подключено → проп message MaintenanceScreen через app/page.tsx и app/[locale]/page.tsx",
  support_contact: "Подключено → GET /api/catalog supportContact, страница /contact, виды orbita support/info",
  default_locale: "Подключено → только fallback (не переопределяет явную локаль): createAssessmentForUser, GET /api/catalog",
  public_product_availability: "Кандидат на скрытие → рантайм-читатели не найдены; держать скрытым из UI администратора, когда возможно",
};

/** Settings table with per-setting wiring annotation + reasoned edit. */
export function SystemSettingsPanel({ permissions }: { permissions: string[] }) {
  const resource = useResource("/api/admin/settings");
  // P2.8: public_product_availability has no runtime readers — hidden from admin UI until implemented.
  const rows = records(resource.data).filter((row) => str(row, "key", "") !== "public_product_availability");
  const canManage = permissions.includes("settings.manage");
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(key: string) {
    const value = (values[key] ?? "").trim();
    if (!value || !reason.trim()) {
      setError("Нужно значение и причина — без причины изменение запрещено.");
      return;
    }
    setBusyKey(key);
    setError(null);
    try {
      await apiJson("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ key, value, reason: reason.trim() }) });
      setValues((current) => ({ ...current, [key]: "" }));
      resource.refresh();
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "Не удалось сохранить настройку.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Panel title="Привязка системных настроек" eyebrow="КАЖДАЯ НАСТРОЙКА ПОДКЛЮЧЕНА ИЛИ СКРЫТА">
      <p className={styles.actionHint}>public_product_availability скрыт из UI: читателей в рантайме нет, будет возвращён при реализации.</p>
      {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {!canManage ? <p className={styles.actionHint}>Изменение требует settings.manage. Таблица доступна для чтения.</p> : null}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr><th>Ключ</th><th>Значение</th><th>подключено к</th><th>Обновлён</th><th>Изменить</th></tr>
          </thead>
          <tbody>
            {resource.loading ? <tr><td colSpan={5}>Загрузка…</td></tr> : rows.length ? rows.map((row) => {
              const key = str(row, "key", "");
              return (
                <tr key={key}>
                  <td>{key}</td>
                  <td title={display(row.value)}>{display(row.value)}</td>
                  <td>{SETTING_WIRING[key] ?? "—"}</td>
                  <td>{formatDate(row.updated_at)}</td>
                  <td>
                    {canManage ? (
                      <span className={styles.inlineFields}>
                        <input
                          placeholder="Новое значение"
                          value={values[key] ?? ""}
                          onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                          aria-label={`Новое значение ${key}`}
                        />
                        <button type="button" className={styles.secondaryButton} disabled={busyKey === key} onClick={() => void save(key)}>
                          {busyKey === key ? "Сохранение…" : "Сохранить"}
                        </button>
                      </span>
                    ) : <span className={styles.actionHint}>только чтение</span>}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={5}>Нет данных</td></tr>}
          </tbody>
        </table>
      </div>
      {canManage ? (
        <div className={styles.inlineFields}>
          <input placeholder="Причина изменения (обязательно, попадёт в audit)" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Причина изменения настройки" />
          <button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button>
        </div>
      ) : null}
    </Panel>
  );
}
