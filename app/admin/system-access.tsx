"use client";

import { useMemo, useState } from "react";

import styles from "./admin-console.module.css";
import {
  PAGE_SIZE,
  apiJson,
  formatDate,
  formatDateShort,
  paginationOf,
  records,
  str,
  ConfirmAction,
  Pager,
  Panel,
  Table,
  useResource,
} from "./ui-kit";

const ROLE_OPTIONS = ["SUPER_ADMIN", "OWNER", "CONTENT_MANAGER", "SUPPORT", "FINANCE", "ANALYST"];

// Inlined from lib/admin-rbac.ts ROLE_PERMISSIONS (client code must not import
// the server-only module). SUPER_ADMIN and OWNER hold the full permission set.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ["Все разрешения администратора (полный набор, включая admins.manage)"],
  OWNER: ["Все разрешения администратора (полный набор, включая admins.manage)"],
  CONTENT_MANAGER: [
    "dashboard.read", "content.read", "content.edit", "content.publish",
    "pricing.read", "careers.read", "careers.edit", "careers.publish", "assessment.read",
    "analytics.read", "audit.read",
  ],
  SUPPORT: [
    "dashboard.read", "users.read", "users.support_actions", "entitlements.read",
    "entitlements.grant", "entitlements.revoke", "orders.read", "assessment.read",
  ],
  FINANCE: [
    "dashboard.read", "orders.read", "orders.refund", "promos.read", "promos.create",
    "promos.update", "promos.disable", "campaigns.read", "campaigns.manage",
    "entitlements.read", "pricing.read", "pricing.manage", "analytics.read", "audit.read",
  ],
  ANALYST: ["dashboard.read", "analytics.read", "campaigns.read", "orders.read", "assessment.read"],
};

function splitRoles(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

export function SystemAccess({ permissions }: { permissions: string[] }) {
  const canRead = permissions.includes("admins.read");
  const canManage = permissions.includes("admins.manage");
  if (!canRead && !canManage) {
    return <div className={styles.stack}><Panel title="Доступ к системе" eyebrow="АДМИНИСТРАТОРЫ / РОЛИ / ПРИГЛАШЕНИЯ">
      <p className={styles.error}>Недостаточно прав: требуется admins.read или admins.manage.</p>
    </Panel></div>;
  }
  return <div className={styles.stack}>
    <Administrators canManage={canManage} />
    <RolesPanel />
    <Invitations canManage={canManage} />
  </div>;
}

// ─── P2.5 Administrators ─────────────────────────────────────────────────────

function Administrators({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"assign" | "revoke" | null>(null);
  const [roleChoice, setRoleChoice] = useState("SUPPORT");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const url = useMemo(() => `/api/admin/admins?limit=${PAGE_SIZE}&page=${page}`, [page]);
  const resource = useResource(url);
  const rows = records(resource.data);
  const pagination = paginationOf(resource.data);
  const table = rows.map((row) => ({
    ...row,
    name: str(row, "full_name", str(row, "email")),
    email: str(row, "email"),
    roles: str(row, "roles"),
    status: str(row, "status"),
    created: formatDate(row.created_at),
  }));
  const selected = rows.find((row) => str(row, "id") === selectedId) ?? null;
  const selectedRoles = selected ? splitRoles(str(selected, "roles")) : [];
  // Best-effort client pre-check on the visible page; the server guard is authoritative.
  const superAdminCount = rows.filter((row) => splitRoles(str(row, "roles")).includes("SUPER_ADMIN")).length;
  const isLastSuperAdmin = selectedRoles.includes("SUPER_ADMIN") && superAdminCount <= 1;

  function openMode(next: "assign" | "revoke") {
    if (!selected) return;
    setMode(next);
    setActionError(null);
    setActionDone(null);
    setRoleChoice(next === "revoke" ? (selectedRoles[0] ?? "SUPER_ADMIN") : "SUPPORT");
  }

  async function run(reason: string) {
    if (!selected || !mode) return;
    if (mode === "revoke" && roleChoice === "SUPER_ADMIN" && isLastSuperAdmin) {
      setActionError("Нельзя отозвать последнего активного SUPER_ADMIN: система должна всегда сохранять хотя бы одного. Сначала назначьте роль SUPER_ADMIN другому администратору.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await apiJson("/api/admin/admins", {
        method: mode === "assign" ? "POST" : "DELETE",
        body: JSON.stringify({ user_id: str(selected, "id"), role: roleChoice, reason }),
      });
      setActionDone(`${mode === "assign" ? "Роль назначена" : "Доступ отозван"}: ${str(selected, "email")} · ${roleChoice}.`);
      setMode(null);
      resource.refresh();
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  }

  const roleOptions = mode === "revoke" ? selectedRoles : ROLE_OPTIONS;
  return <Panel title="Администраторы" eyebrow="АДМИНИСТРАТОРЫ" action={<button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button>}>
    {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
    {actionDone ? <p className={styles.notice}>{actionDone}</p> : null}
    <Table data={table} columns={["name", "email", "roles", "status", "created"]} labels={{ name: "Имя", email: "Email", roles: "Роли", status: "Статус", created: "Создан" }} onSelect={(row) => { setSelectedId(str(row, "id")); setMode(null); setActionError(null); }} selectedId={selectedId} loading={resource.loading} />
    <p className={styles.actionHint}>Нажмите на строку, чтобы управлять ролями. Колонка последней активности опущена: GET /api/admin/admins её не возвращает.</p>
    <Pager page={pagination.page} total={pagination.total} limit={PAGE_SIZE} hasNext={pagination.hasNext} onPage={setPage} />
    {selected ? <>
      <p className={styles.actionHint}>Выбран: {str(selected, "email")} · роли: {selectedRoles.length ? selectedRoles.join(", ") : "—"}</p>
      {canManage ? <div className={styles.actionRow}>
        <button type="button" className={styles.secondaryButton} onClick={() => openMode("assign")}>Назначить роль</button>
        <button type="button" className={styles.secondaryButton} disabled={!selectedRoles.length} title={!selectedRoles.length ? "У администратора нет активных ролей" : "Отозвать роль"} onClick={() => openMode("revoke")}>Отозвать роль</button>
      </div> : <p className={styles.actionHint}>Нет разрешения admins.manage — изменение ролей недоступно.</p>}
      {canManage && mode ? <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <label className={styles.actionHint}>Роль
          <select value={roleChoice} onChange={(event) => setRoleChoice(event.target.value)} aria-label="Роль администратора">
            {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>
        {mode === "revoke" && roleChoice === "SUPER_ADMIN" && isLastSuperAdmin ? <p className={styles.error}>Похоже, это последний активный SUPER_ADMIN на видимой странице. Отзыв будет отклонён сервером (ADMIN_LAST_SUPER_ADMIN), пока другому администратору не назначат SUPER_ADMIN.</p> : null}
        <ConfirmAction
          action={mode === "assign" ? `назначение роли ${roleChoice}` : `отзыв роли ${roleChoice}`}
          consequence={mode === "assign"
            ? `Пользователь ${str(selected, "email")} получит роль ${roleChoice}. Действие попадёт в audit (ADMIN_ROLE_CHANGED).`
            : `Пользователь ${str(selected, "email")} потеряет роль ${roleChoice}. Действие попадёт в audit (ADMIN_DISABLED). Токены и секреты не затрагиваются и нигде не отображаются.`}
          onCancel={() => { setMode(null); setActionError(null); }}
          onConfirm={run}
          busy={busy}
          error={actionError}
        />
      </div> : null}
    </> : <p className={styles.actionHint}>Выберите администратора в таблице, чтобы назначить или отозвать роль.</p>}
  </Panel>;
}

// ─── P2.6 Roles (read-only) ──────────────────────────────────────────────────

function RolesPanel() {
  const resource = useResource("/api/admin/roles");
  const rows = records(resource.data);
  const table = rows.map((row) => {
    const name = str(row, "name");
    return {
      ...row,
      name,
      description: str(row, "description", "—"),
      status: str(row, "status"),
      permissions: (ROLE_PERMISSIONS[name] ?? ["—"]).join(", "),
    };
  });
  return <Panel title="Роли" eyebrow="RBAC · ТОЛЬКО ЧТЕНИЕ" action={<button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button>}>
    {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
    <Table data={table} columns={["name", "description", "status", "permissions"]} labels={{ name: "Имя", description: "Описание", status: "Статус", permissions: "Разрешения" }} loading={resource.loading} />
    <p className={styles.actionHint}>Шесть системных ролей. Создание кастомных ролей вне скоупа. Назначения меняются через панель «Администраторы» (admins.manage).</p>
  </Panel>;
}

// ─── P2.7 Invitations ────────────────────────────────────────────────────────

function Invitations({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formDone, setFormDone] = useState<string | null>(null);
  const url = useMemo(() => `/api/admin/invites?limit=${PAGE_SIZE}&page=${page}`, [page]);
  const resource = useResource(url);
  const rows = records(resource.data);
  const pagination = paginationOf(resource.data);
  const table = rows.map((row) => ({
    ...row,
    email: str(row, "email"),
    role_note: "Назначается после регистрации",
    expires: formatDateShort(row.expires_at),
    status: str(row, "status"),
  }));

  async function send() {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setFormError("Укажите email приглашаемого.");
      return;
    }
    setBusy(true);
    setFormError(null);
    setFormDone(null);
    try {
      await apiJson("/api/admin/invites", { method: "POST", body: JSON.stringify({ email: normalized }) });
      setFormDone(`Приглашение отправлено: ${normalized}.`);
      setEmail("");
      resource.refresh();
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "Не удалось отправить приглашение.");
    } finally {
      setBusy(false);
    }
  }

  return <Panel title="Приглашения" eyebrow="ПРИГЛАШЕНИЯ" action={<button type="button" className={styles.secondaryButton} onClick={resource.refresh}>Обновить</button>}>
    <p className={styles.actionHint}>Приглашения не содержат роли. Роль назначается после регистрации через панель «Администраторы». Токен backend не возвращает и UI его не показывает.</p>
    {canManage ? <div className={styles.toolbar}>
      <input placeholder="Email приглашаемого" value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Email приглашаемого" inputMode="email" />
      <button type="button" className={styles.primaryButton} disabled={busy} onClick={send}>{busy ? "Отправка…" : "Отправить приглашение"}</button>
    </div> : <p className={styles.actionHint}>Нет разрешения admins.manage — отправка приглашений недоступна.</p>}
    {formError ? <p className={styles.error}>{formError}</p> : null}
    {formDone ? <p className={styles.notice}>{formDone}</p> : null}
    {resource.error ? <p className={styles.error}>{resource.error}</p> : null}
    <Table data={table} columns={["email", "role_note", "expires", "status"]} labels={{ email: "Email", role_note: "Примечание о роли", expires: "Истекает", status: "Статус" }} loading={resource.loading} />
    <Pager page={pagination.page} total={pagination.total} limit={PAGE_SIZE} hasNext={pagination.hasNext} onPage={setPage} />
  </Panel>;
}
