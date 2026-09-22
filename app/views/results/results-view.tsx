"use client";

import { ArrowRight } from "@/app/views/shared/section-heading";
import { ClientDate } from "@/app/views/shared/client-date";
import { type ReportJSON, type ScoreProfile } from "@/lib/assessment-engine";
import type { View } from "@/app/orbita-view-types";
import { useSiteLang, SiteLangToggle } from "@/lib/site-lang";
import { RES_STRINGS } from "@/lib/site-strings";

const DOMAIN_COLORS = ["sage", "blue", "amber", "coral", "rose", "lavender"];

const DOMAIN_HEX = ["#8FA888", "#7C93A8", "#C79A5B", "#C1836F", "#B78D97", "#9B93B5"];

function colorFor(index: number): string {
  return DOMAIN_COLORS[Math.floor(index / 5)] ?? "sage";
}

function hexFor(index: number): string {
  return DOMAIN_HEX[Math.floor(index / 5)] ?? DOMAIN_HEX[0];
}



function ScoreRow({ trait, index, t }: { trait: ScoreProfile["traits"][number]; index: number; t: (typeof RES_STRINGS)["ru"] }) {
  const color = DOMAIN_COLORS[Math.floor(index / 5)] ?? "sage";
  return (
    <article className={`ov-results-score-row ov-tag-${color}`}>
      <span className={`ov-results-rank ov-badge ov-tag-${color}`}>{String(trait.rank).padStart(2, "0")}</span>
      <div className="ov-results-score-name">
        <strong>{trait.name}</strong>
        <small>{trait.code} · {t.band(trait.standardScore)}</small>
      </div>
      <div className="ov-results-score-bar">
        <span style={{ width: `${trait.standardScore}%` }} />
      </div>
      <div className="ov-results-score-num">
        <strong>{trait.standardScore}</strong>
        <small>{t.index(trait.profileIndex)}</small>
      </div>
      <div className="ov-results-score-ci">
        <small>{t.range}</small>
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
  const [lang, setLang] = useSiteLang();
  const t = RES_STRINGS[lang];
  const ordered = [...profile.traits].sort((a, b) => a.rank - b.rank);
  const strengthen = ordered.slice(0, 10);
  const study = ordered.slice(10);
  const topFive = report.topStrengths.slice(0, 5);
  const careers = report.career?.ranking ?? [];
  const traitIndexByCode = new Map(ordered.map((trait, index) => [trait.code, index]));
  const traitDisplayName = (code: string) =>
    ordered.find((trait) => trait.code === code)?.name ?? code;
  let sectionNumber = 0;
  const nextSectionNum = () => String(++sectionNumber).padStart(2, "0");

  return (
    <div className="orbita-view ov-results">
      <header className="ov-results-head">
        <div className="ov-container wide">
          <div className="ov-results-head-row">
            <div>
              <span className="ov-eyebrow">
                <span className="ov-status-dot" />
                {t.eyebrow}
              </span>
              <h1>{t.h1}</h1>
              <p className="ov-results-head-lede">{report.executiveSummary}</p>
              <p className="ov-results-head-meta">
                {t.cutFrom} <ClientDate dateOnly />{t.meta(profile.versions.assessment, Math.round(profile.responseQuality.rqi * 100))}
              </p>
            </div>
            <div className="ov-results-head-actions">
              <SiteLangToggle lang={lang} onLang={setLang} />
              <button className="ov-btn ov-btn-secondary" onClick={onPrint} type="button">
                {t.print}
              </button>
              <button className="ov-btn ov-btn-ghost" onClick={() => onNavigate("account")} type="button">
                {t.account}
                <ArrowRight />
              </button>
            </div>
          </div>
          <ProfileStrip traits={ordered} t={t} />
        </div>
      </header>

      <main className="ov-results-main">
        <div className="ov-container wide">
          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{t.strengthen}</h2>
                <p>{t.strengthenB}</p>
              </div>
            </header>
            <ol className="ov-results-ranked">
              {strengthen.map((trait) => (
                <li key={trait.code}>
                  <span className="ov-results-rank-tick" style={{ background: hexFor(traitIndexByCode.get(trait.code) ?? 0) }} aria-hidden="true" />
                  <span className="ov-results-rank-num">{trait.rank}</span>
                  <span className="ov-results-rank-name">{trait.name}</span>
                </li>
              ))}
            </ol>
          </section>

          {study.length ? (
          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{t.study}</h2>
                <p>{t.studyB}</p>
              </div>
            </header>
            <ol className="ov-results-ranked ov-results-ranked-muted" start={strengthen.length + 1}>
              {study.map((trait) => (
                <li key={trait.code}>
                  <span className="ov-results-rank-tick" style={{ background: hexFor(traitIndexByCode.get(trait.code) ?? 0) }} aria-hidden="true" />
                  <span className="ov-results-rank-num">{trait.rank}</span>
                  <span className="ov-results-rank-name">{trait.name}</span>
                </li>
              ))}
            </ol>
          </section>
          ) : null}

          {careers.length ? (
          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{lang === "kk" ? "Мансап бағыттары" : "Карьерные направления"}</h2>
                <p>{lang === "kk" ? "Бұл — шешім емес, сіздің жауаптарыңызға сәйкес келетін бағыттарды зерттеуге арналған бастапқы нүкте." : "Это не предписание, а стартовая точка для исследования направлений, которые согласуются с вашими ответами."}</p>
              </div>
            </header>
            <ol className="ov-results-ranked ov-results-careers">
              {careers.slice(0, 5).map((candidate, index) => {
                const title = typeof candidate.title === "string" ? candidate.title : typeof candidate.professionId === "string" ? candidate.professionId : `#${index + 1}`;
                const score = typeof candidate.totalScore === "number" ? `${Math.round(candidate.totalScore * 100)}%` : "";
                return <li key={`${title}-${index}`}><span className="ov-results-rank-num">{typeof candidate.rank === "number" ? candidate.rank : index + 1}</span><span className="ov-results-rank-name">{title}</span><strong>{score}</strong></li>;
              })}
            </ol>
          </section>
          ) : null}

          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{t.detailT}</h2>
                <p>{provider === "openai" ? t.detailAi : t.detailLib}</p>
              </div>
            </header>
            <div className="ov-results-details">
              {topFive.map((item, index) => {
                const traitIdx = traitIndexByCode.get(item.trait) ?? index;
                const displayName = traitDisplayName(item.trait);
                return (
                <article className="ov-results-detail" key={item.trait}>
                  <div className="ov-results-detail-strip" aria-hidden="true">
                    {ordered.map((t, i) => (
                      <span
                        key={t.code}
                        style={{
                          background: i === traitIdx ? hexFor(traitIdx) : "var(--border)",
                          opacity: i === traitIdx ? 1 : 0.55,
                        }}
                      />
                    ))}
                  </div>
                  <span className={`ov-results-detail-domain ov-tag-${colorFor(traitIdx)}`}>{String(index + 1).padStart(2, "0")} · {displayName}</span>
                  <h3>{displayName}</h3>
                  <p className="ov-results-detail-lede">{item.contribution}</p>
                  <div className="ov-results-detail-quotes">
                    {item.manifestations.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <div className="ov-results-overuse">
                    <span>{t.overuse}</span>
                    <p>{item.overuseRisk}</p>
                  </div>
                </article>
                );
              })}
            </div>
          </section>

          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{t.fullProfile(profile.traits.length)}</h2>
                <p>{t.fullB}</p>
              </div>
              <span className="ov-muted">{t.fullMeta}</span>
            </header>
            <div className="ov-results-score-list">
              {profile.traits.map((trait, index) => (
                <ScoreRow index={index} key={trait.code} trait={trait} t={t} />
              ))}
            </div>
          </section>

          {profile.domains.length ? (
          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{profile.domains.length} {t.domain(profile.domains.length)}</h2>
                <p>{t.navB}</p>
              </div>
            </header>
            <div className="ov-results-domains">
              {profile.domains.map((domain, index) => (
                <article className={`ov-results-domain-card ov-tag-${DOMAIN_COLORS[index]}`} key={domain.code}>
                  <span className="ov-results-domain-code">{domain.code}</span>
                  <h3>{domain.name}</h3>
                  <strong className="ov-results-domain-score">{domain.score}</strong>
                  <small>{t.aggIndex(domain.profileIndex)}</small>
                  <div className="ov-results-domain-bar">
                    <span style={{ width: `${domain.score}%` }} />
                  </div>
                </article>
              ))}
            </div>
          </section>
          ) : null}

          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{t.planT}</h2>
                <p>{t.numWords[report.development30Days.length] ?? String(report.development30Days.length)} {t.action(report.development30Days.length)} на 30 дней</p>
              </div>
            </header>
            <div className="ov-two-col ov-results-interpretation">
              <div className="ov-results-interpretation-main">
                <article className="ov-card">
                  <span className="ov-eyebrow">{t.envT}</span>
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
                  <span className="ov-eyebrow">{t.teamT}</span>
                  <p>
                    <strong>{t.gives}</strong> {report.teamwork.gives}
                  </p>
                  <p>
                    <strong>{t.needs}</strong> {report.teamwork.needs}
                  </p>
                </article>
              </div>

              <aside className="ov-results-interpretation-side">
                <div className="ov-results-plan">
                  {report.development30Days.map((action, index) => (
                    <article className="ov-results-plan-row" key={action}>
                      <span className="ov-results-plan-num">{String(index + 1).padStart(2, "0")}</span>
                      <p>{action}</p>
                      <span className="ov-results-plan-check"><ResultsCheck /></span>
                    </article>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <article className="ov-results-disclaimer">
            <ShieldIcon />
            <div>
              <strong>{t.discT}</strong>
              <p>{report.confidenceNote}</p>
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}

function ProfileStrip({ traits, t }: { traits: ScoreProfile["traits"]; t: (typeof RES_STRINGS)["ru"] }) {
  const width = 640;
  const height = 64;
  const gap = 4;
  const barWidth = (width - gap * (traits.length - 1)) / traits.length;
  return (
    <div className="ov-results-strip" role="img" aria-label={t.stripAria(traits.length, traits.slice(0, 5).map((x) => x.name).join(", "))}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
        {traits.map((trait, index) => {
          const h = height * (0.35 + 0.65 * (trait.standardScore / 100));
          const strong = index < 10;
          return (
            <rect
              key={trait.code}
              x={index * (barWidth + gap)}
              y={height - h}
              width={barWidth}
              height={h}
              rx={Math.min(3, barWidth / 2)}
              fill={hexFor(index)}
              opacity={strong ? 0.95 : 0.35}
            />
          );
        })}
      </svg>
      <div className="ov-results-strip-legend">
        <span>{t.stripS}</span>
        <span>{t.stripSt}</span>
      </div>
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
