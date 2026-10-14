"use client";

import { useEffect, useMemo, useState } from "react";
import { TeenOnboardingView } from "@/app/views/onboarding/teen-onboarding-view";
import { teenRuntimeContent } from "@/lib/t-skills/teen/runtime";
import { scoreTeenStage1, selectTeenStage2, applyTeenStage2Correction } from "@/lib/t-skills/teen/scoring";
import { scoreTeenCareers } from "@/lib/t-skills/teen/matching";
import { buildTeenReport, type TeenReport } from "@/lib/t-skills/teen/report";
import { TEEN_UI, type TeenLocale } from "@/lib/t-skills/teen/ui-strings";
import { TEEN_CAREER_CATALOG_V2, teenCareerCatalog, teenCareerEntry } from "@/lib/t-skills/teen/careers";
import { traitDomainHex } from "@/lib/trait-domains";
import { TEEN_V4_VERSION_IDS, type TeenOnboarding } from "@/lib/t-skills/teen/taxonomy";
import "@/app/views/teen/teen.css";

const STORAGE_KEY = "t-skills-teen-flow-v4";
const LOCALE_KEY = "t-skills-teen-locale";
const STATE_TTL_MS = 24 * 60 * 60 * 1000;
const STATIC_VALUES = [-2, -1, 0, 1, 2];

type PersistedState = {
  savedAt?: number;
  onboarding: TeenOnboarding | null;
  onboardingDone: boolean;
  answers75: Record<string, number>;
  stage2answers: Record<string, number>;
};

const EMPTY_STATE: PersistedState = { onboarding: null, onboardingDone: false, answers75: {}, stage2answers: {} };

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (!Number.isFinite(savedAt) || savedAt <= 0 || Date.now() - savedAt > STATE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return EMPTY_STATE;
    }
    return {
      savedAt,
      onboarding: parsed.onboarding ?? null,
      onboardingDone: parsed.onboardingDone ?? false,
      answers75: parsed.answers75 ?? {},
      stage2answers: parsed.stage2answers ?? {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

function loadLocale(): TeenLocale {
  try {
    return localStorage.getItem(LOCALE_KEY) === "kk" ? "kk" : "ru";
  } catch {
    return "ru";
  }
}

function LocaleToggle({ locale, onChange }: { locale: TeenLocale; onChange: (next: TeenLocale) => void }) {
  return (
    <span className="ov-teen-locale" role="group" aria-label="Тіл / Язык">
      {(["ru", "kk"] as TeenLocale[]).map((option) => (
        <button
          key={option}
          className={option === locale ? "selected" : ""}
          onClick={() => onChange(option)}
          type="button"
        >
          {option === "ru" ? "РУ" : "ҚЗ"}
        </button>
      ))}
    </span>
  );
}

export function TeenFlowView({ onHome }: { onHome: () => void }) {
  const [locale, setLocale] = useState<TeenLocale>("ru");
  const content = useMemo(() => teenRuntimeContent(locale), [locale]);
  const strings = TEEN_UI[locale];
  const [state, setState] = useState<PersistedState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [staticIndex, setStaticIndex] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string>();

  useEffect(() => {
    // Исключение: клиентский хайдрейт persisted-стейта (SSR localStorage недоступен).
    const saved = loadState();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(saved);
    setLocale(loadLocale());
    // FIX3: вернуться к первому неотвеченному вопросу, а не к началу.
    const firstUnanswered = content.items75.findIndex((item) => typeof saved.answers75[item.id] !== "number");
    setStaticIndex(firstUnanswered === -1 ? content.items75.length - 1 : firstUnanswered);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  }, [state, hydrated]);

  const changeLocale = (next: TeenLocale) => {
    setLocale(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // ignore
    }
  };

  const stage1 = useMemo(
    () => scoreTeenStage1(content.items75.map((item) => ({ id: item.id, leftTraitId: item.leftTraitId, rightTraitId: item.rightTraitId })), state.answers75),
    [content, state.answers75],
  );
  const stage2Traits = useMemo(() => selectTeenStage2(stage1.totals, stage1.contributions), [stage1]);
  const stage2Questions = useMemo(
    () => stage2Traits.map((traitId) => content.stage2.find((question) => question.traitId === traitId)!).filter(Boolean),
    [content, stage2Traits],
  );
  const totalsAfterStage2 = useMemo(() => {
    let totals = stage1.totals;
    for (const question of stage2Questions) {
      const answer = state.stage2answers[question.id];
      if (typeof answer === "number") totals = applyTeenStage2Correction(totals, question.traitId, answer);
    }
    return totals;
  }, [stage1, stage2Questions, state.stage2answers]);
  const ranked = useMemo(
    () => (state.onboarding ? scoreTeenCareers(totalsAfterStage2, teenCareerCatalog(TEEN_CAREER_CATALOG_V2, locale), state.onboarding) : []),
    [totalsAfterStage2, locale, state.onboarding],
  );
  const report: TeenReport | null = useMemo(
    () => (state.onboarding ? buildTeenReport(content, totalsAfterStage2, ranked, state.onboarding, 5, 5, TEEN_V4_VERSION_IDS) : null),
    [content, totalsAfterStage2, ranked, state.onboarding],
  );

  if (!hydrated) return null;

  if (!state.onboardingDone) {
    return (
      <TeenOnboardingView
        initial={state.onboarding}
        locale={locale}
        backLabel={strings.back}
        onBack={onHome}
        onSkip={() => setState((current) => ({
          ...current,
          onboarding: {
            valueRanking: ["stability", "income", "growth", "value-autonomy", "social-impact", "creative-freedom", "status", "work-life-balance"],
            subjects: [],
          },
          onboardingDone: true,
        }))}
        onSubmit={async (value) => setState((current) => ({ ...current, onboarding: value, onboardingDone: true }))}
        headerExtra={<LocaleToggle locale={locale} onChange={changeLocale} />}
      />
    );
  }

  const answeredStatic = content.items75.filter((item) => typeof state.answers75[item.id] === "number").length;
  if (answeredStatic < content.items75.length) {
    const index = Math.min(staticIndex, content.items75.length - 1);
    const item = content.items75[index];
    const texts = content.items75Texts[item.id];
    const current = state.answers75[item.id];
    const pick = (value: number) => {
      setState((prev) => ({ ...prev, answers75: { ...prev.answers75, [item.id]: value } }));
      window.setTimeout(() => setStaticIndex((i) => Math.min(i + 1, content.items75.length - 1)), 220);
    };
    return (
      <div className="orbita-view ov-teen">
        <div className="ov-container ov-container-narrow">
          <div className="ov-teen-topbar">
            <span className="ov-eyebrow">{strings.mainPart}</span>
            <strong>{strings.questionOf(index + 1, content.items75.length)}</strong>
            <LocaleToggle locale={locale} onChange={changeLocale} />
          </div>
          <div className="ov-teen-progress"><span style={{ width: `${Math.round((answeredStatic / content.items75.length) * 100)}%` }} /></div>
          <div key={`${locale}-${item.id}`} className="ov-teen-question-enter">
            <p className="ov-teen-prompt">{strings.whatCloser}</p>
            <div className="ov-teen-pair">
              <div className="ov-teen-card ov-teen-card-left"><p>{texts.left}</p></div>
              <div className="ov-teen-scale" role="radiogroup" aria-label={strings.whatCloser}>
                {STATIC_VALUES.map((value, optionIndex) => (
                  <button
                    key={value}
                    className={`ov-teen-dot${current === value ? " selected" : ""}`}
                    aria-label={strings.staticLabels[optionIndex]}
                    onClick={() => pick(value)}
                    type="button"
                  />
                ))}
              </div>
              <div className="ov-teen-card ov-teen-card-right"><p>{texts.right}</p></div>
            </div>
            <div className="ov-teen-nav">
              <button className="ov-teen-back" disabled={index === 0} onClick={() => setStaticIndex((i) => Math.max(0, i - 1))} type="button">{strings.back}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stage2Index = stage2Questions.findIndex((question) => typeof state.stage2answers[question.id] !== "number");
  if (stage2Index !== -1) {
    const question = stage2Questions[stage2Index];
    // FIX4: «Назад» снимает предыдущий ответ — derived-индекс сам отъезжает.
    const goBackStage2 = () => {
      const prev = stage2Questions[stage2Index - 1];
      if (!prev) return;
      setState((current) => {
        const stage2answers = { ...current.stage2answers };
        delete stage2answers[prev.id];
        return { ...current, stage2answers };
      });
    };
    return (
      <div className="orbita-view ov-teen">
        <div className="ov-container ov-container-narrow">
          <div className="ov-teen-topbar">
            <span className="ov-eyebrow">{strings.clarification}</span>
            <strong>{strings.questionOf(stage2Index + 1, stage2Questions.length)}</strong>
            <LocaleToggle locale={locale} onChange={changeLocale} />
          </div>
          <div className="ov-teen-progress"><span style={{ width: `${Math.round((stage2Index / stage2Questions.length) * 100)}%` }} /></div>
          <div key={`${locale}-${question.id}`} className="ov-teen-question-enter">
            <p className="ov-teen-trait">{content.traitNames[question.traitId]}</p>
            <p className="ov-teen-scenario">{question.scenario}</p>
            <div className="ov-teen-options">
              {question.options.map((option) => (
                <button
                  key={option.id}
                  className="ov-teen-option"
                  onClick={() => setState((prev) => ({ ...prev, stage2answers: { ...prev.stage2answers, [question.id]: option.value } }))}
                  type="button"
                >
                  <span className="ov-teen-option-id">{option.id}</span>
                  <span>{option.text}</span>
                </button>
              ))}
            </div>
            <div className="ov-teen-nav">
              <button className="ov-teen-back" disabled={stage2Index === 0} onClick={goBackStage2} type="button">{strings.back}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const downloadPdf = async () => {
    if (!report) return;
    setPdfBusy(true);
    setPdfError(undefined);
    try {
      const response = await fetch("/api/teen/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report, locale }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = locale === "kk" ? "t-skills-teen-report-kk.pdf" : "t-skills-teen-report.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError(strings.pdfError);
    } finally {
      setPdfBusy(false);
    }
  };

  const restart = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(EMPTY_STATE);
    setStaticIndex(0);
  };

  return (
    <div className="orbita-view ov-teen">
      <div className="ov-container">
        <div className="ov-teen-report-top">
          <button className="ov-back-link" onClick={onHome} type="button">{strings.home}</button>
          <LocaleToggle locale={locale} onChange={changeLocale} />
        </div>
        <p className="ov-eyebrow">{strings.yourResult}</p>
        <h1 className="ov-teen-report-title">{strings.reportTitle}</h1>
        {report ? (
          <>
            <div className="ov-teen-careers">
              {report.careers.map((career, index) => {
                const catalogEntry = teenCareerEntry(TEEN_CAREER_CATALOG_V2, career.professionId, locale);
                const title = catalogEntry?.title ?? career.title;
                const sphere = catalogEntry?.sphere ?? career.sphere;
                const education = catalogEntry?.education ?? career.education;
                const description = catalogEntry?.description ?? career.description;
                return (
                <article key={career.professionId} className="ov-teen-career-card">
                  <span className="ov-teen-career-rank">{index + 1}</span>
                  <div>
                    <h2>{title}</h2>
                    <p className="ov-teen-career-meta">{sphere}{education ? ` · ${education}` : ""}</p>
                    <p>{description}</p>
                  </div>
                </article>
                );
              })}
            </div>
            <h2 className="ov-teen-section-title">{strings.topTraits}</h2>
            <ol className="ov-teen-traits">
              {report.topTraits.map((trait) => (
                <li key={trait.traitId}>
                  <span>{trait.name}</span>
                  <span className="ov-teen-trait-bar"><span style={{ width: `${Math.round(((trait.normalized + 1) / 2) * 100)}%`, background: traitDomainHex(trait.traitId, "teen") }} /></span>
                </li>
              ))}
            </ol>
            {report.topValues.length > 0 ? (
              <p className="ov-teen-echo">{strings.importantToYou}: {report.topValues.map((value) => value.name).join(" · ")}</p>
            ) : null}
            {pdfError ? <p className="ov-form-error">{pdfError}</p> : null}
            <div className="ov-teen-report-actions">
              <button className="ov-btn ov-btn-primary" disabled={pdfBusy} onClick={() => void downloadPdf()} type="button">
                {pdfBusy ? strings.preparingPdf : strings.downloadPdf}
              </button>
              <button className="ov-teen-skip" onClick={restart} type="button">{strings.retry}</button>
            </div>
            <p className="ov-teen-draft-note">{strings.draftNote(report.contentStatus)}</p>
          </>
        ) : (
          <p>{strings.fillOnboarding}</p>
        )}
      </div>
    </div>
  );
}
