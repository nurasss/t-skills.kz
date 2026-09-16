"use client";

import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import type { AccountOverview, View } from "@/app/orbita-view-types";
import type { ScoreProfile } from "@/lib/assessment-engine";

export type AccountViewProps = {
  onNavigate: (view: View) => void;
  profile?: ScoreProfile;
  demoMode: boolean;
  overview?: AccountOverview;
  loading: boolean;
  actionStatus?: string;
  betaFree: boolean;
  onStartAssessment: () => void;
  onOpenReport: (reportId: string) => void;
  onExport: () => void;
  onDelete: () => void;
  onDeleteAssessment: (assessmentId: string) => void;
};

export function AccountView({
  onNavigate,
  profile,
  demoMode,
  overview,
  loading,
  actionStatus,
  betaFree,
  onStartAssessment,
  onOpenReport,
  onExport,
  onDelete,
  onDeleteAssessment,
}: AccountViewProps) {
  const latestAssessment = overview?.assessments[0];
  const paidOrder = overview?.orders.find((order) => order.status === "PAID");
  const hasWork = Boolean(latestAssessment);
  const displayName = overview?.user.displayName ?? "Ваш профиль";
  const assessmentAction = latestAssessment?.state === "COMPLETE"
    ? "Открыть результат"
    : latestAssessment
      ? "Продолжить оценку"
      : paidOrder || betaFree
        ? "Начать оценку"
        : "Сначала оформить доступ";

  return (
    <div className="orbita-view ov-account">
      <div className="ov-container wide">
        <SectionHeading
          eyebrow="Личный кабинет"
          title="Ваши сессии и результаты."
          body="Здесь хранятся доступы, прогресс и уже готовые версии отчётов."
        />

        <div className="ov-account-grid">
          <article className="ov-card ov-account-profile">
            <header className="ov-account-profile-head">
              <span className="ov-account-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <h2 className="ov-card-title">{displayName}</h2>
                <p className="ov-card-desc">RU · данные под вашим контролем</p>
              </div>
            </header>

            <hr className="ov-divider" />

            <div className="ov-account-settings">
              <div className="ov-account-setting">
                <span>Согласия</span>
                <strong>управляются перед началом</strong>
              </div>
              <div className="ov-account-setting">
                <span>Хранение</span>
                <strong>экспорт и удаление доступны</strong>
              </div>
            </div>

            <button className="ov-btn ov-btn-secondary ov-btn-block" onClick={() => onNavigate("privacy")} type="button">
              Управлять данными
              <ArrowRight />
            </button>
          </article>

          <article className="ov-card ov-account-test">
            <header className="ov-card-header">
              <div className="ov-catalog-tags">
                <span className={`ov-badge ${latestAssessment?.state === "COMPLETE" ? "ov-badge-primary" : "ov-badge-outline"}`}>
                  {loading ? "Загрузка…" : latestAssessment?.state ?? (paidOrder || betaFree ? "Доступ активен" : "Нет доступа")}
                </span>
                <span className="ov-badge ov-badge-outline">orbita30_ru_v2</span>
              </div>
              <h2 className="ov-card-title">ORBITA—30</h2>
              <p className="ov-card-desc">
                {demoMode
                  ? "Демо-профиль · не сохранён на сервере"
                  : latestAssessment
                    ? "Сессия сохранена на сервере"
                    : betaFree
                      ? "Закрытая бесплатная beta · пилотная версия"
                      : paidOrder
                        ? "Оплата подтверждена · можно начать"
                        : "Оформите доступ, чтобы начать"}
              </p>
            </header>

            {profile ? (
              <div className="ov-account-result">
                <div className="ov-account-result-meta">
                  <span>{demoMode ? "Демо Top 5" : latestAssessment?.state === "COMPLETE" ? "Top 5" : "Предварительный Top 5"}</span>
                  <strong>{profile.traits.slice(0, 3).map((trait) => trait.name).join(" · ")}</strong>
                  <small>RQI {Math.round(profile.responseQuality.rqi * 100)}%</small>
                </div>
                <button
                  className="ov-btn ov-btn-primary ov-btn-block"
                  onClick={
                    demoMode
                      ? () => onNavigate("results")
                      : latestAssessment?.reportId
                        ? () => onOpenReport(latestAssessment.reportId as string)
                        : onStartAssessment
                  }
                  type="button"
                >
                  {demoMode ? "Открыть демо-результат" : assessmentAction}
                  <ArrowRight />
                </button>
              </div>
            ) : (
              <div className="ov-account-empty">
                <p className="ov-account-empty-text">
                  {loading
                    ? "Загружаем ваши данные…"
                    : hasWork
                      ? "Сессия готова к продолжению."
                      : betaFree
                        ? "Закрытый beta-доступ активен. Начните с обязательных согласий."
                        : paidOrder
                          ? "Оплата подтверждена. Создайте сессию и начните с согласий."
                          : "Пройдите тест или откройте демо, чтобы увидеть, как выглядит результат."}
                </p>
                <button
                  className="ov-btn ov-btn-primary ov-btn-block"
                  disabled={loading || (!betaFree && !paidOrder && !latestAssessment)}
                  onClick={
                    latestAssessment?.reportId
                      ? () => onOpenReport(latestAssessment.reportId as string)
                      : onStartAssessment
                  }
                  type="button"
                >
                  {loading
                    ? "Загрузка…"
                    : latestAssessment
                      ? assessmentAction
                      : betaFree || paidOrder
                        ? "Начать оценку"
                        : "Открыть каталог"}
                  <ArrowRight />
                </button>
                {!betaFree && !paidOrder && !latestAssessment ? (
                  <button className="ov-btn ov-btn-ghost ov-btn-block" onClick={() => onNavigate("catalog")} type="button">
                    Посмотреть доступные оценки
                  </button>
                ) : null}
              </div>
            )}
          </article>
        </div>

        <div className="ov-account-history">
          <article className="ov-card">
            <header className="ov-card-header">
              <h3 className="ov-card-title">Заказы</h3>
              <p className="ov-card-desc">Цена и валюта зафиксированы в каждом order.</p>
            </header>
            {overview?.orders.length ? (
              <ul className="ov-account-history-list">
                {overview.orders.map((order) => (
                  <li key={order.id}>
                    <div>
                      <strong>{order.testId}</strong>
                      <small>{new Date(order.createdAt).toLocaleString("ru-RU")}</small>
                    </div>
                    <div>
                      <strong>{(order.amountMinor / 100).toLocaleString("ru-RU")} {order.currency}</strong>
                      <small>{order.status}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ov-muted">Заказов пока нет.</p>
            )}
          </article>

          <article className="ov-card">
            <header className="ov-card-header">
              <h3 className="ov-card-title">Сессии</h3>
              <p className="ov-card-desc">Последнее подтверждённое состояние хранится на сервере.</p>
            </header>
            {overview?.assessments.length ? (
              <ul className="ov-account-history-list">
                {overview.assessments.map((assessment) => (
                  <li key={assessment.id}>
                    <div>
                      <strong>{assessment.state}</strong>
                      <small>{assessment.clientSeq} ответов · {new Date(assessment.updatedAt).toLocaleString("ru-RU")}</small>
                    </div>
                    <div className="ov-account-row-actions">
                      {assessment.reportId ? (
                        <button className="ov-btn ov-btn-ghost ov-btn-sm" onClick={() => onOpenReport(assessment.reportId as string)} type="button">
                          Отчёт
                        </button>
                      ) : null}
                      <button className="ov-btn ov-btn-ghost ov-btn-sm" aria-label="Удалить оценку" onClick={() => onDeleteAssessment(assessment.id)} type="button">
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ov-muted">Сессий пока нет.</p>
            )}
          </article>
        </div>

        <div className="ov-account-stats">
          <div>
            <span>Core item bank</span>
            <strong>60</strong>
            <small>30 primary Likert · 30 discrimination</small>
          </div>
          <div>
            <span>Версия scoring</span>
            <strong>mvp-0.5-core60</strong>
            <small>deterministic · reproducible</small>
          </div>
          <div>
            <span>Права данных</span>
            <strong>готовы</strong>
            <small>export · delete</small>
          </div>
        </div>

        <div className="ov-account-data-actions">
          <button className="ov-btn ov-btn-secondary" onClick={onExport} type="button">
            Запросить экспорт данных
            <ArrowRight />
          </button>
          <button className="ov-btn ov-btn-ghost" onClick={onDelete} type="button">
            Удалить аккаунт
          </button>
          {actionStatus ? <span className="ov-account-status">{actionStatus}</span> : null}
        </div>
      </div>
    </div>
  );
}
