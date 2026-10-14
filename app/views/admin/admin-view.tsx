"use client";

import { ArrowRight } from "@/app/views/shared/section-heading";
import type { AdminMetrics, View } from "@/app/orbita-view-types";
import type { ScoreProfile } from "@/lib/assessment-engine";
import { T_SKILLS_TEEN_CLARIFICATION_COUNT, T_SKILLS_TEEN_STATIC_ITEM_COUNT, T_SKILLS_TEEN_V4_VERSION_IDS } from "@/lib/t-skills/versions";

export type AdminViewProps = {
  profile?: ScoreProfile;
  onNavigate: (view: View) => void;
  metrics?: AdminMetrics;
};

const ITEM_RANGES = [
  { range: "t75-1–t75-75", type: "pairwise forced-choice", count: T_SKILLS_TEEN_STATIC_ITEM_COUNT, status: T_SKILLS_TEEN_V4_VERSION_IDS.assessment },
  { range: "t2-* (8 из 25)", type: "situational clarification", count: T_SKILLS_TEEN_CLARIFICATION_COUNT, status: T_SKILLS_TEEN_V4_VERSION_IDS.adaptive },
  { range: "Q001–Q300", type: "legacy bank", count: 300, status: "legacy" },
];

export function AdminView({ profile, onNavigate, metrics }: AdminViewProps) {
  const paidOrders = metrics?.orders.find((item) => item.status === "PAID")?.count ?? 0;
  const completedReports = metrics?.reports.find((item) => item.status === "COMPLETE")?.count ?? 0;
  const failedReports = metrics?.reports.find((item) => item.status === "REPORT_FAILED_RETRYABLE")?.count ?? 0;

  return (
    <div className="orbita-view ov-admin">
      <div className="ov-container wide">
        <header className="ov-admin-head">
          <div>
            <span className="ov-eyebrow">Internal / admin preview</span>
            <h1>Контроль версии и качества.</h1>
            <p className="ov-card-desc">
              Лёгкий интерфейс для проверки item bank, scoring configs и telemetry без доступа к
              ответам по умолчанию.
            </p>
          </div>
          <span className="ov-badge ov-badge-outline">read-only demo</span>
        </header>

        <div className="ov-admin-metrics">
          <article className="ov-admin-metric">
            <span>Pairwise bank</span>
            <strong>{T_SKILLS_TEEN_STATIC_ITEM_COUNT}</strong>
            <small>{T_SKILLS_TEEN_V4_VERSION_IDS.assessment} · pilot / unvalidated</small>
          </article>
          <article className="ov-admin-metric">
            <span>Users</span>
            <strong>{metrics?.users ?? "—"}</strong>
            <small>server-side aggregate</small>
          </article>
          <article className="ov-admin-metric">
            <span>Paid orders</span>
            <strong>{metrics ? paidOrders : "—"}</strong>
            <small>signed webhook events</small>
          </article>
          <article className="ov-admin-metric">
            <span>Reports</span>
            <strong>{metrics ? completedReports : "—"}</strong>
            <small>{metrics ? `${failedReports} retryable` : "admin allowlist required"}</small>
          </article>
          <article className="ov-admin-metric">
            <span>Pilot sample</span>
            <strong>{metrics?.pilotAnalytics.sampleSize ?? "—"}</strong>
            <small>
              {metrics?.pilotAnalytics.insufficientData
                ? `нужно ≥${metrics.pilotAnalytics.minimumSampleForPsychometrics}, stats скрыты`
                : "descriptive pilot only"}
            </small>
          </article>
        </div>

        <div className="ov-two-col ov-admin-grid">
          <article className="ov-card">
            <header className="ov-card-header">
              <h3 className="ov-card-title">T-Skills Pairwise Bank</h3>
              <p className="ov-card-desc">
                Живой банк 67 парных сравнений и до 8 карьерных уточнений; v1 Q001–Q300 сохранён как legacy.
              </p>
            </header>
            <div className="ov-admin-table">
              <div className="ov-admin-table-head">
                <span>Диапазон</span>
                <span>Тип</span>
                <span>Кол-во</span>
                <span>Статус</span>
              </div>
              {ITEM_RANGES.map((row) => (
                <div className="ov-admin-table-row" key={row.range}>
                  <span>{row.range}</span>
                  <span>{row.type}</span>
                  <strong>{row.count}</strong>
                  <span className={`ov-badge ${row.status === "legacy" ? "ov-badge-outline" : "ov-badge-primary"}`}>{row.status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="ov-card">
            <header className="ov-card-header">
              <h3 className="ov-card-title">Последний run</h3>
              <p className="ov-card-desc">
                {metrics ? "Сводка доступна только allowlisted admin" : "Для сводки нужен admin allowlist"}
              </p>
            </header>
            <div className="ov-admin-audit">
              <div>
                <span className="ov-admin-audit-icon"><MethodCheck /></span>
                <span>
                  <strong>Score JSON</strong>
                  <small>{profile ? `готов · ${profile.versions.scoring}` : "ожидает сессию"}</small>
                </span>
              </div>
              <div>
                <span className="ov-admin-audit-icon"><MethodShield /></span>
                <span>
                  <strong>Quality flags</strong>
                  <small>{profile ? `${profile.responseQuality.flags.length} flags` : "не запускался"}</small>
                </span>
              </div>
              <div>
                <span className="ov-admin-audit-icon"><MethodDoc /></span>
                <span>
                  <strong>Report JSON</strong>
                  <small>{metrics ? `${completedReports} complete` : "protected metrics"}</small>
                </span>
              </div>
              <div>
                <span className="ov-admin-audit-icon"><MethodLock /></span>
                <span>
                  <strong>PII boundary</strong>
                  <small>{metrics ? "aggregate only" : "payload minimized"}</small>
                </span>
              </div>
            </div>
            <button className="ov-btn ov-btn-secondary ov-btn-block" onClick={() => onNavigate("methodology")} type="button">
              Открыть методологию
              <ArrowRight />
            </button>
          </article>
        </div>
      </div>
    </div>
  );
}

function MethodCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

function MethodShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z" strokeLinejoin="round" />
    </svg>
  );
}

function MethodDoc() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6" strokeLinejoin="round" />
    </svg>
  );
}

function MethodLock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}
