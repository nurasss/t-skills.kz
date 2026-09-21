"use client";

import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import { ClientDate } from "@/app/views/shared/client-date";
import type { AccountOverview, View } from "@/app/orbita-view-types";
import type { ScoreProfile } from "@/lib/assessment-engine";
import { useSiteLang, SiteLangToggle } from "@/lib/site-lang";
import { ACCOUNT_STRINGS } from "@/lib/site-strings";
import { T_SKILLS_TEST_ID, T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

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
  onLogout: () => void;
  onDeleteAssessment: (assessmentId: string) => void;
};

/**
 * Сокращение длинного имени/почты с сохранением узнаваемости:
 * "bulatulynurasyl22@gmail.com" -> "bul..22@gmail.com".
 * Короткие значения возвращаются как есть.
 */
function shortenDisplayName(name: string): string {
  if (name.length <= 24) return name;
  const at = name.indexOf("@");
  if (at < 0) return `${name.slice(0, 22)}…`;
  const local = name.slice(0, at);
  const domain = name.slice(at + 1);
  return `${local.slice(0, 3)}..${local.slice(-2)}@${domain}`;
}

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
  onLogout,
  onDeleteAssessment,
}: AccountViewProps) {
  const [lang, setLang] = useSiteLang();
  const t = ACCOUNT_STRINGS[lang];
  const latestAssessment = overview?.assessments[0];
  const paidOrder = overview?.orders.find((order) => order.status === "PAID");
  const hasWork = Boolean(latestAssessment);
  const assessmentVersion = latestAssessment?.versions?.assessment;
  const isTSkillsV5 = assessmentVersion === T_SKILLS_V5_VERSION_IDS.assessment;
  const isTSkillsV4 = assessmentVersion === T_SKILLS_VERSION_IDS.assessment ||
    !latestAssessment ||
    (latestAssessment.testId === T_SKILLS_TEST_ID && !assessmentVersion);
  const assessmentLabel = isTSkillsV5 ? T_SKILLS_V5_VERSION_IDS.assessment : isTSkillsV4 ? T_SKILLS_VERSION_IDS.assessment : "orbita30_ru_v2";
  const staticQuestionCount = isTSkillsV5 ? "75" : isTSkillsV4 ? "67" : "60";
  const adaptiveDescription = isTSkillsV5 ? t.adV5 : isTSkillsV4 ? t.adV4 : t.adLegacy;
  const scoringVersion = isTSkillsV5 ? "pairwise25-v1" : isTSkillsV4 ? "pairwise-scoring-v1" : "mvp-0.5-core60";
  const fullDisplayName = overview?.user.displayName ?? t.fallbackName;
  const displayName = shortenDisplayName(fullDisplayName);
  const assessmentAction = latestAssessment?.state === "COMPLETE"
    ? t.openResult
    : latestAssessment
      ? t.continueAs
      : paidOrder || betaFree
        ? t.startAs
        : t.getAccessFirst;

  return (
    <div className="orbita-view ov-account">
      <div className="ov-container wide">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <SiteLangToggle lang={lang} onLang={setLang} />
        </div>
        <SectionHeading
          eyebrow={t.eyebrow}
          title={t.title}
          body={t.body}
        />

        <div className="ov-account-grid">
          <article className="ov-card ov-account-profile">
            <header className="ov-account-profile-head">
              <span className="ov-account-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <h2 className="ov-card-title" title={fullDisplayName}>
                  <span className="ov-display-full">{fullDisplayName}</span>
                  <span className="ov-display-short" aria-hidden="true">{displayName}</span>
                </h2>
                <p className="ov-card-desc">{t.localeLine(lang === "kk" ? "KZ" : "RU")}</p>
              </div>
            </header>

            <hr className="ov-divider" />

            <div className="ov-account-settings">
              <div className="ov-account-setting">
                <span>{t.consents}</span>
                <strong>{t.consentsV}</strong>
              </div>
              <div className="ov-account-setting">
                <span>{t.storage}</span>
                <strong>{t.storageV}</strong>
              </div>
            </div>

            <button className="ov-btn ov-btn-secondary ov-btn-block" onClick={() => onNavigate("privacy")} type="button">
              {t.manage}
              <ArrowRight />
            </button>
          </article>

          <article className="ov-card ov-account-test">
            <header className="ov-card-header">
              <div className="ov-catalog-tags">
                <span className={`ov-badge ${latestAssessment?.state === "COMPLETE" ? "ov-badge-primary" : "ov-badge-outline"}`}>
                  {loading ? t.loading : latestAssessment?.state ?? (paidOrder || betaFree ? t.activeAccess : t.noAccess)}
                </span>
                <span className="ov-badge ov-badge-outline">{assessmentLabel}</span>
              </div>
              <h2 className="ov-card-title">T-Skills</h2>
              <p className="ov-card-desc">
                {demoMode
                  ? t.demoProfile
                  : latestAssessment
                    ? t.sessionSaved
                    : betaFree
                      ? t.betaDesc
                      : paidOrder
                        ? t.paidDesc
                        : t.getAccess}
              </p>
            </header>

            {profile ? (
              <div className="ov-account-result">
                <div className="ov-account-result-meta">
                  <span>{demoMode ? t.demoTop : latestAssessment?.state === "COMPLETE" ? t.top : t.prelimTop}</span>
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
                  {demoMode ? t.openDemo : assessmentAction}
                  <ArrowRight />
                </button>
              </div>
            ) : (
              <div className="ov-account-empty">
                <p className="ov-account-empty-text">
                  {loading
                    ? t.loadingData
                    : hasWork
                      ? latestAssessment?.state === "COMPLETE"
                        ? t.doneOpen
                        : t.readyContinue
                      : betaFree
                        ? t.betaStart
                        : paidOrder
                          ? t.paidStart
                          : t.emptyHint}
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
                    ? t.loading
                    : latestAssessment
                      ? assessmentAction
                      : betaFree || paidOrder
                        ? t.start
                        : t.openCatalog}
                  <ArrowRight />
                </button>
                {!betaFree && !paidOrder && !latestAssessment ? (
                  <button className="ov-btn ov-btn-ghost ov-btn-block" onClick={() => onNavigate("catalog")} type="button">
                    {t.seeTests}
                  </button>
                ) : null}
              </div>
            )}
          </article>
        </div>

        <div className="ov-account-history">
          <article className="ov-card">
            <header className="ov-card-header">
              <h3 className="ov-card-title">{t.orders}</h3>
              <p className="ov-card-desc">{t.ordersD}</p>
            </header>
            {overview?.orders.length ? (
              <ul className="ov-account-history-list">
                {overview.orders.map((order) => (
                  <li key={order.id}>
                    <div>
                      <strong>{order.testId}</strong>
                      <small><ClientDate value={order.createdAt} /></small>
                    </div>
                    <div>
                      <strong>{(order.amountMinor / 100).toLocaleString(lang === "kk" ? "kk-KZ" : "ru-RU")} {order.currency}</strong>
                      <small>{order.status}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ov-muted">{t.noOrders}</p>
            )}
          </article>

          <article className="ov-card">
            <header className="ov-card-header">
              <h3 className="ov-card-title">{t.sessions}</h3>
              <p className="ov-card-desc">{t.sessionsD}</p>
            </header>
            {overview?.assessments.length ? (
              <ul className="ov-account-history-list">
                {overview.assessments.map((assessment) => (
                  <li key={assessment.id}>
                    <div>
                      <strong>{assessment.state}</strong>
                      <small>{t.answers(assessment.clientSeq)} · <ClientDate value={assessment.updatedAt} /></small>
                    </div>
                    <div className="ov-account-row-actions">
                      {assessment.reportId ? (
                        <button className="ov-btn ov-btn-ghost ov-btn-sm" onClick={() => onOpenReport(assessment.reportId as string)} type="button">
                          {t.report}
                        </button>
                      ) : null}
                      <button className="ov-btn ov-btn-ghost ov-btn-sm" aria-label={t.delAria} onClick={() => onDeleteAssessment(assessment.id)} type="button">
                        {t.del}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ov-muted">{t.noSessions}</p>
            )}
          </article>
        </div>

        <div className="ov-account-stats">
          <div>
            <span>{t.staticPart}</span>
            <strong>{staticQuestionCount}</strong>
            <small>{adaptiveDescription}</small>
          </div>
          <div>
            <span>{t.scoringV}</span>
            <strong>{scoringVersion}</strong>
            <small>deterministic · reproducible</small>
          </div>
          <div>
            <span>{t.dataRights}</span>
            <strong>{t.dataRightsV}</strong>
            <small>export · delete</small>
          </div>
        </div>

        <div className="ov-account-data-actions">
          <button className="ov-btn ov-btn-secondary" onClick={onExport} type="button">
            {t.export}
            <ArrowRight />
          </button>
          <button className="ov-btn ov-btn-secondary" onClick={onLogout} type="button">
            {t.logout}
          </button>
          <button className="ov-btn ov-btn-ghost" onClick={onDelete} type="button">
            {t.deleteAcc}
          </button>
          {actionStatus ? <span className="ov-account-status">{actionStatus}</span> : null}
        </div>
      </div>
    </div>
  );
}
