"use client";

import { ArrowRight } from "@/app/views/shared/section-heading";
import { traitName, type ReportJSON, type ScoreProfile } from "@/lib/assessment-engine";
import type { View } from "@/app/orbita-view-types";

const DOMAIN_COLORS = ["sage", "blue", "amber", "coral", "rose", "lavender"];

function scoreBand(score: number): string {
  if (score >= 75) return "выраженный диапазон";
  if (score >= 55) return "рабочий диапазон";
  return "менее выраженный диапазон";
}

function ScoreRow({ trait, index }: { trait: ScoreProfile["traits"][number]; index: number }) {
  const color = DOMAIN_COLORS[Math.floor(index / 5)] ?? "sage";
  return (
    <article className={`ov-results-score-row ov-tag-${color}`}>
      <span className={`ov-results-rank ov-badge ov-tag-${color}`}>{String(trait.rank).padStart(2, "0")}</span>
      <div className="ov-results-score-name">
        <strong>{trait.name}</strong>
        <small>{trait.code} · {scoreBand(trait.standardScore)}</small>
      </div>
      <div className="ov-results-score-bar">
        <span style={{ width: `${trait.standardScore}%` }} />
      </div>
      <div className="ov-results-score-num">
        <strong>{trait.standardScore}</strong>
        <small>индекс {trait.profileIndex}</small>
      </div>
      <div className="ov-results-score-ci">
        <small>Диапазон</small>
        <span>{trait.uncertaintyRange[0]}—{trait.uncertaintyRange[1]}</span>
      </div>
    </article>
  );
}

export type ResultsViewProps = {
  profile: ScoreProfile;
  report: ReportJSON;
  provider?: string;
  onNavigate: (view: View) => void;
  onPrint: () => void;
};

export function ResultsView({ profile, report, provider, onNavigate, onPrint }: ResultsViewProps) {
  const top = profile.traits.slice(0, 5);
  const topThree = report.topStrengths.slice(0, 3);

  return (
    <div className="orbita-view ov-results">
      <header className="ov-results-head">
        <div className="ov-container wide">
          <div className="ov-results-head-row">
            <div>
              <span className="ov-eyebrow">
                <span className="ov-status-dot" />
                T-Skills · ваш результат
              </span>
              <h1>Карта способа действовать.</h1>
              <p className="ov-results-head-meta">
                Срез от {new Date().toLocaleDateString("ru-RU")} · {profile.versions.assessment} · версия для пилота
              </p>
            </div>
            <div className="ov-results-head-actions">
              <button className="ov-btn ov-btn-secondary" onClick={onPrint} type="button">
                Печать / сохранить PDF
              </button>
              <button className="ov-btn ov-btn-ghost" onClick={() => onNavigate("account")} type="button">
                В личный кабинет
                <ArrowRight />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="ov-results-main">
        <div className="ov-container wide">
          <section className="ov-results-overview">
            <div className="ov-results-overview-card">
              <span className="ov-eyebrow">Контур профиля</span>
              <strong className="ov-results-overview-codes">{top.map((trait) => trait.code).join(" · ")}</strong>
              <small>Текущий набор лидирующих шкал</small>
            </div>

            <div className="ov-results-overview-card">
              <span className="ov-eyebrow">Краткий сигнал</span>
              <p className="ov-results-overview-summary">{report.executiveSummary}</p>
              <div className="ov-results-tags">
                {top.slice(0, 3).map((trait) => (
                  <span className="ov-badge ov-badge-outline" key={trait.code}>
                    {trait.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="ov-results-overview-card ov-results-overview-quality">
              <span className="ov-eyebrow">Качество ответов</span>
              <strong className="ov-results-overview-rqi">
                {Math.round(profile.responseQuality.rqi * 100)}<small>%</small>
              </strong>
              <small>{profile.responseQuality.flags.length ? "есть флаги для внимания" : "без критических флагов"}</small>
            </div>
          </section>

          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">01</span>
                <h2>Top 5</h2>
                <p>Наиболее выраженные способы действия в текущем профиле</p>
              </div>
              <span className="ov-muted">ранги и диапазоны неопределённости</span>
            </header>

            <div className="ov-results-top-five">
              {top.map((trait, index) => (
                <article className={`ov-results-top-card ov-tag-${DOMAIN_COLORS[Math.floor(index / 5)]}`} key={trait.code}>
                  <header>
                    <span>0{index + 1}</span>
                    <span className="ov-badge ov-badge-outline">индекс {trait.profileIndex}</span>
                  </header>
                  <h3>{trait.name}</h3>
                  <p>{trait.definition}</p>
                  <div className="ov-results-top-score">
                    <strong>{trait.standardScore}</strong>
                    <span>
                      стандартизированный балл
                      <br />
                      диапазон {trait.uncertaintyRange[0]}—{trait.uncertaintyRange[1]}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">02</span>
                <h2>Полный профиль 30</h2>
                <p>Контекст важнее одного места</p>
              </div>
              <span className="ov-muted">балл, неопределённость и пилотный индекс</span>
            </header>
            <div className="ov-results-score-list">
              {profile.traits.map((trait, index) => (
                <ScoreRow index={index} key={trait.code} trait={trait} />
              ))}
            </div>
          </section>

          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">03</span>
                <h2>6 доменов</h2>
                <p>Навигация, не замена профилю шкал</p>
              </div>
            </header>
            <div className="ov-results-domains">
              {profile.domains.map((domain, index) => (
                <article className={`ov-results-domain-card ov-tag-${DOMAIN_COLORS[index]}`} key={domain.code}>
                  <span className="ov-results-domain-code">{domain.code}</span>
                  <h3>{domain.name}</h3>
                  <strong className="ov-results-domain-score">{domain.score}</strong>
                  <small>индекс {domain.profileIndex} · агрегат пяти θ</small>
                  <div className="ov-results-domain-bar">
                    <span style={{ width: `${domain.score}%` }} />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">04</span>
                <h2>Как это может проявляться</h2>
                <p>{provider === "openai" ? "Интерпретация через защищённый report provider" : "Интерпретация из approved library"}</p>
              </div>
            </header>
            <div className="ov-two-col ov-results-interpretation">
              <div className="ov-results-interpretation-main">
                {topThree.map((item, index) => (
                  <article className="ov-results-interpretation-card" key={item.trait}>
                    <span className="ov-results-interpretation-tag">0{index + 1} · {traitName(item.trait)}</span>
                    <p>{item.contribution}</p>
                    <ul>
                      {item.manifestations.map((line) => (
                        <li key={line}>
                          <ResultsCheck /> {line}
                        </li>
                      ))}
                    </ul>
                    <div className="ov-results-overuse">
                      <span>Перегрузка · риск в определённых условиях</span>
                      <p>{item.overuseRisk}</p>
                    </div>
                  </article>
                ))}
              </div>

              <aside className="ov-results-interpretation-side">
                <article className="ov-card">
                  <span className="ov-eyebrow">Подходящие рабочие условия</span>
                  <ul className="ov-list ov-results-list-marker">
                    {report.workEnvironments.map((line) => (
                      <li key={line}>
                        <span className="ov-results-list-dot" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="ov-card">
                  <span className="ov-eyebrow">Команда</span>
                  <p>
                    <strong>Вы даёте:</strong> {report.teamwork.gives}
                  </p>
                  <p>
                    <strong>Вам полезно получать:</strong> {report.teamwork.needs}
                  </p>
                </article>
              </aside>
            </div>
          </section>

          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">05</span>
                <h2>План развития на 30 дней</h2>
                <p>Пять наблюдаемых действий</p>
              </div>
            </header>
            <div className="ov-results-plan">
              {report.development30Days.map((action, index) => (
                <article className="ov-results-plan-row" key={action}>
                  <span className="ov-results-plan-num">{String(index + 1).padStart(2, "0")}</span>
                  <p>{action}</p>
                  <span className="ov-results-plan-check"><ResultsCheck /></span>
                </article>
              ))}
            </div>
          </section>

          <article className="ov-results-disclaimer">
            <ShieldIcon />
            <div>
              <strong>Как читать диапазон неопределённости</strong>
              <p>{report.confidenceNote}</p>
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}

function ResultsCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z" strokeLinejoin="round" />
    </svg>
  );
}
