"use client";

import { ArrowRight } from "@/app/views/shared/section-heading";
import { ClientDate } from "@/app/views/shared/client-date";
import { type ReportJSON, type ScoreProfile } from "@/lib/assessment-engine";
import type { View } from "@/app/orbita-view-types";
import { useSiteLang } from "@/lib/site-lang";
import { OB_STRINGS, RES_STRINGS } from "@/lib/site-strings";
import { teenTraitName } from "@/lib/t-skills/teen/runtime";
import { TEEN_CAREER_CATALOG_V1, teenCareerEntry } from "@/lib/t-skills/teen/careers";
import { taxonomyForAssessmentVersion, traitDomainColorKey, traitDomainHex, type TraitTaxonomy } from "@/lib/trait-domains";
import { isTSkillsTeenVersion } from "@/lib/t-skills/versions";
import { getTeenTraitInterpretation } from "@/lib/t-skills/teen/trait-interpretations";
import type { TeenTraitId } from "@/lib/t-skills/teen/taxonomy";
import { T_SKILLS_TEEN_V1_VERSION_IDS } from "@/lib/t-skills/versions";

function ScoreRow({ trait, t, name, teen, taxonomy }: { trait: ScoreProfile["traits"][number]; index: number; t: (typeof RES_STRINGS)["ru"]; name: string; teen: boolean; taxonomy: TraitTaxonomy }) {
  const color = traitDomainColorKey(String(trait.code), taxonomy);
  return (
    <article className={`ov-results-score-row ov-tag-${color}`}>
      <span className={`ov-results-rank ov-badge ov-tag-${color}`}>{String(trait.rank).padStart(2, "0")}</span>
      <div className="ov-results-score-name">
        <strong>{name}</strong>
        <small>{t.band(trait.standardScore)}</small>
      </div>
      <div className="ov-results-score-bar">
        <span
          style={{
            width: `${trait.standardScore}%`,
            background: traitDomainHex(String(trait.code), taxonomy),
          }}
        />
      </div>
      <div className="ov-results-score-num">
        <strong>{trait.standardScore}</strong>
      </div>
      <div className="ov-results-score-ci">
        {teen || !trait.uncertaintyRange
          ? t.intervalUncalibrated
          : `${trait.uncertaintyRange[0]}–${trait.uncertaintyRange[1]}`}
      </div>
    </article>
  );
}

export type ResultsViewProps = {
  profile: ScoreProfile;
  report: ReportJSON;
  provider?: string;
  /** Живой пример (демо): скрыть секцию «Полный профиль», расчёты не трогаем. */
  demo?: boolean;
  onNavigate: (view: View) => void;
  onPrint: () => void;
};

export function ResultsView({ profile, report, provider, demo = false, onNavigate, onPrint }: ResultsViewProps) {
  const [lang] = useSiteLang();
  const t = RES_STRINGS[lang];
  const teen = isTSkillsTeenVersion(profile.versions.assessment);
  const catalogVersion = report.career?.versions?.careerCatalog ?? TEEN_CAREER_CATALOG_V1;
  const taxonomy = taxonomyForAssessmentVersion(profile.versions.assessment);
  const legacyTeenScoring = profile.versions.assessment === T_SKILLS_TEEN_V1_VERSION_IDS.assessment;
  const ob = OB_STRINGS[lang];
  const nameOf = (trait: ScoreProfile["traits"][number]) => (teen ? teenTraitName(trait.code, lang) : null) ?? trait.name;
  const ordered = [...profile.traits].sort((a, b) => a.rank - b.rank);
  const topValues = report.career?.topValues ?? [];
  const chosenSubjects = report.career?.subjects ?? [];
  const strengthen = ordered.slice(0, 10);
  const study = ordered.slice(10);
  const topFive = report.topStrengths.slice(0, 5);
  const careers = report.career?.ranking ?? [];
  const traitIndexByCode = new Map(ordered.map((trait, index) => [trait.code, index]));
  const traitDisplayName = (code: string) => {
    const trait = ordered.find((candidate) => candidate.code === code);
    return trait ? nameOf(trait) : code;
  };
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
              <p className="ov-results-head-lede">
                {lang === "kk"
                  ? `Сіздің қазіргі бейініңіз мына қасиеттердің үйлесіміне негізделген: ${topFive.map((s) => traitDisplayName(s.trait)).join(", ")}. Бұл — шағын мансаптық және оқу тәжірибелерімен тексеруге қолайлы дамытушы срез.`
                  : report.executiveSummary}
              </p>
              <p className="ov-results-head-meta">
                {t.cutFrom} <ClientDate dateOnly />{t.meta(profile.versions.assessment, Math.round(profile.responseQuality.rqi * 100))}
              </p>
              {teen ? <p className="ov-results-head-meta">{t.teenMeasurementNotice}</p> : null}
            </div>
            <div className="ov-results-head-actions">
              <button className="ov-btn ov-btn-secondary" onClick={onPrint} type="button">
                {t.print}
              </button>
              <button className="ov-btn ov-btn-ghost" onClick={() => onNavigate("account")} type="button">
                {t.account}
                <ArrowRight />
              </button>
            </div>
          </div>
          <ProfileStrip traits={ordered} t={t} nameOf={nameOf} taxonomy={taxonomy} />
        </div>
      </header>

      <main className="ov-results-main">
        <div className="ov-container wide">
          {legacyTeenScoring ? (
            <article className="ov-results-disclaimer ov-results-legacy-warning" role="alert">
              <ShieldIcon />
              <div>
                <strong>{t.legacyTeenResultTitle}</strong>
                <p>{t.legacyTeenResultBody}</p>
              </div>
            </article>
          ) : null}
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
                  <span className="ov-results-rank-tick" style={{ background: traitDomainHex(String(trait.code), taxonomy) }} aria-hidden="true" />
                  <span className="ov-results-rank-num">{trait.rank}</span>
                  <span className="ov-results-rank-name">{nameOf(trait)}</span>
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
                  <span className="ov-results-rank-tick" style={{ background: traitDomainHex(String(trait.code), taxonomy) }} aria-hidden="true" />
                  <span className="ov-results-rank-num">{trait.rank}</span>
                  <span className="ov-results-rank-name">{nameOf(trait)}</span>
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
                const entry = candidate as typeof candidate & { description?: unknown; sphere?: unknown; education?: unknown };
                const catalogEntry = teen && typeof candidate.professionId === "string"
                  ? teenCareerEntry(catalogVersion, candidate.professionId, lang)
                  : null;
                const title = catalogEntry?.title ?? (typeof candidate.title === "string" ? candidate.title : typeof candidate.professionId === "string" ? candidate.professionId : `#${index + 1}`);
                const description = catalogEntry?.description ?? entry.description;
                const sphere = catalogEntry?.sphere ?? entry.sphere;
                const education = catalogEntry?.education ?? entry.education;
                const hasDetails = [description, sphere, education].some((value) => typeof value === "string" && value.trim());
                return <li key={`${title}-${index}`}>
                  <span className="ov-results-rank-num">{typeof candidate.rank === "number" ? candidate.rank : index + 1}</span>
                  <div className="ov-results-career-content">
                    <span className="ov-results-rank-name">{title}</span>
                    {hasDetails ? <details className="ov-results-career-details">
                      <summary>{lang === "kk" ? "Бағыт туралы" : "О направлении"}</summary>
                      {typeof description === "string" && description.trim() ? <p>{description}</p> : null}
                      {typeof sphere === "string" && sphere.trim() ? <p><strong>{lang === "kk" ? "Сала:" : "Сфера:"}</strong> {sphere}</p> : null}
                      {typeof education === "string" && education.trim() ? <p><strong>{lang === "kk" ? "Білім:" : "Образование:"}</strong> {education}</p> : null}
                    </details> : null}
                  </div>
                </li>;
              })}
            </ol>
            {topValues.length || chosenSubjects.length ? (
              <dl className="ov-results-context">
                {topValues.length ? (
                  <div>
                    <dt>{lang === "kk" ? "Сіз үшін маңызды" : "Для вас важно"}</dt>
                    <dd>{topValues.map((value) => ob.valueOpts[value] ?? value).join(" · ")}</dd>
                  </div>
                ) : null}
                {chosenSubjects.length ? (
                  <div>
                    <dt>{ob.subjects}</dt>
                    <dd>{chosenSubjects.map((subject) => ob.subjectOpts[subject] ?? subject).join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
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
                const traitHex = traitDomainHex(String(item.trait), taxonomy);
                const interp = teen ? getTeenTraitInterpretation(item.trait as TeenTraitId, lang) : null;
                const contribution = interp?.contribution ?? item.contribution;
                const manifestations = interp?.manifestations ?? item.manifestations;
                const overuseRisk = interp?.overuseRisk ?? item.overuseRisk;
                return (
                <article className="ov-results-detail" key={item.trait}>
                  <div className="ov-results-detail-strip" aria-hidden="true">
                    {ordered.map((t, i) => (
                      <span
                        key={t.code}
                        style={{
                          background: i === traitIdx ? traitHex : "var(--border)",
                          opacity: i === traitIdx ? 1 : 0.55,
                        }}
                      />
                    ))}
                  </div>
                  <span className={`ov-results-detail-domain ov-tag-${traitDomainColorKey(String(item.trait), taxonomy)}`}>{String(index + 1).padStart(2, "0")} · {displayName}</span>
                  <h3>{displayName}</h3>
                  <p className="ov-results-detail-lede">{contribution}</p>
                  <div className="ov-results-detail-quotes">
                    {manifestations.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <div className="ov-results-overuse">
                    <span>{t.overuse}</span>
                    <p>{overuseRisk}</p>
                  </div>
                </article>
                );
              })}
            </div>
          </section>

          {demo ? null : (
          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{t.fullProfile(profile.traits.length)}</h2>
                <p>{t.fullB}</p>
              </div>
              <span className="ov-muted">{teen ? t.fullMetaTeen : t.fullMeta}</span>
            </header>
            <div className="ov-results-score-head" aria-hidden="true">
              <span />
              <span>{lang === "kk" ? "Қасиет" : "Качество"}</span>
              <span>{lang === "kk" ? "Үлестірім" : "Распределение"}</span>
              <span>{lang === "kk" ? "Балл және индекс" : "Балл и индекс"}</span>
              <span>{teen ? t.intervalUncalibrated : lang === "kk" ? "Сенімділік аралығы" : "Доверительный диапазон"}</span>
            </div>
            <div className="ov-results-score-list">
              {profile.traits.map((trait, index) => (
                <ScoreRow index={index} key={trait.code} trait={trait} t={t} name={nameOf(trait)} teen={teen} taxonomy={taxonomy} />
              ))}
            </div>
          </section>
          )}

          {demo ? null : (
          <section className="ov-results-section">
            <header className="ov-results-section-head">
              <div>
                <span className="ov-results-section-num">{nextSectionNum()}</span>
                <h2>{t.planT}</h2>
                <p>{t.numWords[report.development30Days.length] ?? String(report.development30Days.length)} {t.action(report.development30Days.length)} {lang === "kk" ? "30 күнге" : "на 30 дней"}</p>
              </div>
            </header>
            <div className="ov-two-col ov-results-interpretation">
              <div className="ov-results-interpretation-main">
                <article className="ov-card">
                  <span className="ov-eyebrow">{t.envT}</span>
                  <ul className="ov-list ov-results-list-marker">
                    {(lang === "kk"
                      ? ["Түсінікті тапсырмасы мен кері байланыс алу мүмкіндігі бар орта.", "Гипотезаларды шағын қадамдармен тексеруге болатын жобалар."]
                      : report.workEnvironments
                    ).map((line) => (
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
                    <strong>{t.gives}</strong> {lang === "kk" ? "Сіз өз жетекші қасиеттеріңіз бен нақты келісімдер арқылы үлес қоса аласыз." : report.teamwork.gives}
                  </p>
                  <p>
                    <strong>{t.needs}</strong> {lang === "kk" ? "Рөлдерді, нәтиже критерийлерін және кері байланыс тәсілін алдын ала нақтылаған пайдалы." : report.teamwork.needs}
                  </p>
                </article>
              </div>

              <aside className="ov-results-interpretation-side">
                <div className="ov-results-plan">
                  {(lang === "kk"
                    ? ["Шағын жобаны таңдап, қандай қасиеттердің көрінгенін белгілеңіз.", "Жұмысыңызды көрген адаммен сөйлесіп, бақылауларды салыстырыңыз.", "Келесі бір мансаптық тәжірибені жазып қойыңыз."]
                    : report.development30Days
                  ).map((action, index) => (
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
          )}

          <article className="ov-results-disclaimer">
            <ShieldIcon />
            <div>
              <strong>{t.discT}</strong>
              <p>
                {lang === "kk"
                  ? "Бұл — 75 жұптық салыстыру мен 8 жағдаяттық нақтылау бойынша детерминирленген жұмыс кесіндісі. Ол диагноз, болжам немесе үкімді шешім болып табылмайды."
                  : report.confidenceNote}
              </p>
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}

function ProfileStrip({ traits, t, nameOf, taxonomy }: { traits: ScoreProfile["traits"]; t: (typeof RES_STRINGS)["ru"]; nameOf: (trait: ScoreProfile["traits"][number]) => string; taxonomy: TraitTaxonomy }) {
  const width = 640;
  const height = 64;
  const gap = 4;
  const barWidth = (width - gap * (traits.length - 1)) / traits.length;
  return (
    <div className="ov-results-strip" role="img" aria-label={t.stripAria(traits.length, traits.slice(0, 5).map(nameOf).join(", "))}>
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
              fill={traitDomainHex(String(trait.code), taxonomy)}
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
