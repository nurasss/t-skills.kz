"use client";

import { useEffect, useMemo, useState } from "react";
import { TeenOnboardingView } from "@/app/views/onboarding/teen-onboarding-view";
import { parseTeenContentBundle, type TeenContentBundle } from "@/lib/t-skills/teen/content";
import { scoreTeenStage1, selectTeenStage2, applyTeenStage2Correction } from "@/lib/t-skills/teen/scoring";
import { scoreTeenCareers } from "@/lib/t-skills/teen/matching";
import { buildTeenStage3bPairs, applyTeenPreference } from "@/lib/t-skills/teen/stage3b";
import { buildTeenReport, type TeenReport } from "@/lib/t-skills/teen/report";
import type { TeenOnboarding } from "@/lib/t-skills/teen/taxonomy";
import bundleJson from "@/lib/t-skills/teen/content.v1.json";
import "@/app/views/teen/teen.css";

const STORAGE_KEY = "t-skills-teen-flow-v1";
const STATIC_LABELS = ["Сильно левое", "Скорее левое", "Одинаково", "Скорее правое", "Сильно правое"];
const STATIC_VALUES = [-2, -1, 0, 1, 2];

type PersistedState = {
  onboarding: TeenOnboarding | null;
  onboardingDone: boolean;
  answers75: Record<string, number>;
  stage2answers: Record<string, number>;
  prefPicks: Record<string, string>;
};

const EMPTY_STATE: PersistedState = { onboarding: null, onboardingDone: false, answers75: {}, stage2answers: {}, prefPicks: {} };

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      onboarding: parsed.onboarding ?? null,
      onboardingDone: parsed.onboardingDone ?? false,
      answers75: parsed.answers75 ?? {},
      stage2answers: parsed.stage2answers ?? {},
      prefPicks: parsed.prefPicks ?? {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function TeenFlowView({ onHome }: { onHome: () => void }) {
  const content: TeenContentBundle = useMemo(() => parseTeenContentBundle(bundleJson), []);
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
    // FIX3: вернуться к первому неотвеченному вопросу, а не к началу.
    const firstUnanswered = content.items75.findIndex((item) => typeof saved.answers75[item.id] !== "number");
    setStaticIndex(firstUnanswered === -1 ? content.items75.length - 1 : firstUnanswered);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

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
    () => (state.onboarding ? scoreTeenCareers(totalsAfterStage2, content.professions, state.onboarding) : []),
    [totalsAfterStage2, content, state.onboarding],
  );
  const prefPairs = useMemo(() => buildTeenStage3bPairs(ranked), [ranked]);
  const rankedFinal = useMemo(() => {
    let next = ranked;
    for (const pair of prefPairs) {
      const pick = state.prefPicks[pair.id];
      if (pick) next = applyTeenPreference(next, pair, pick);
    }
    return next;
  }, [ranked, prefPairs, state.prefPicks]);
  const report: TeenReport | null = useMemo(
    () => (state.onboarding ? buildTeenReport(content, totalsAfterStage2, rankedFinal, state.onboarding) : null),
    [content, totalsAfterStage2, rankedFinal, state.onboarding],
  );

  if (!hydrated) return null;

  if (!state.onboardingDone) {
    return (
      <TeenOnboardingView
        initial={state.onboarding}
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
            <span className="ov-eyebrow">Основная часть</span>
            <strong>Вопрос {index + 1} из {content.items75.length}</strong>
          </div>
          <div className="ov-teen-progress"><span style={{ width: `${Math.round((answeredStatic / content.items75.length) * 100)}%` }} /></div>
          <div key={item.id} className="ov-teen-question-enter">
            <p className="ov-teen-prompt">Что тебе ближе?</p>
            <div className="ov-teen-pair">
              <div className="ov-teen-card ov-teen-card-left"><p>{texts.left}</p></div>
              <div className="ov-teen-scale" role="radiogroup" aria-label="Выберите, какое утверждение ближе">
                {STATIC_VALUES.map((value, optionIndex) => (
                  <button
                    key={value}
                    className={`ov-teen-dot${current === value ? " selected" : ""}`}
                    aria-label={STATIC_LABELS[optionIndex]}
                    onClick={() => pick(value)}
                    type="button"
                  />
                ))}
              </div>
              <div className="ov-teen-card ov-teen-card-right"><p>{texts.right}</p></div>
            </div>
            <div className="ov-teen-nav">
              <button className="ov-teen-back" disabled={index === 0} onClick={() => setStaticIndex((i) => Math.max(0, i - 1))} type="button">← Назад</button>
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
            <span className="ov-eyebrow">Уточнение</span>
            <strong>Вопрос {stage2Index + 1} из {stage2Questions.length}</strong>
          </div>
          <div className="ov-teen-progress"><span style={{ width: `${Math.round((stage2Index / stage2Questions.length) * 100)}%` }} /></div>
          <div key={question.id} className="ov-teen-question-enter">
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
              <button className="ov-teen-back" disabled={stage2Index === 0} onClick={goBackStage2} type="button">← Назад</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const prefIndex = prefPairs.findIndex((pair) => !state.prefPicks[pair.id]);
  if (prefIndex !== -1 && state.onboarding) {
    const pair = prefPairs[prefIndex];
    const byId = new Map(content.professions.map((profession) => [profession.id, profession]));
    const left = byId.get(pair.leftProfessionId)!;
    const right = byId.get(pair.rightProfessionId)!;
    const pick = (id: string) => setState((prev) => ({ ...prev, prefPicks: { ...prev.prefPicks, [pair.id]: id } }));
    // FIX4: «Назад» снимает предыдущий выбор.
    const goBackPref = () => {
      const prev = prefPairs[prefIndex - 1];
      if (!prev) return;
      setState((current) => {
        const prefPicks = { ...current.prefPicks };
        delete prefPicks[prev.id];
        return { ...current, prefPicks };
      });
    };
    return (
      <div className="orbita-view ov-teen">
        <div className="ov-container ov-container-narrow">
          <div className="ov-teen-topbar">
            <span className="ov-eyebrow">Что ближе?</span>
            <strong>Пара {prefIndex + 1} из {prefPairs.length}</strong>
          </div>
          <div className="ov-teen-progress"><span style={{ width: `${Math.round((prefIndex / prefPairs.length) * 100)}%` }} /></div>
          <div key={pair.id} className="ov-teen-question-enter">
            <p className="ov-teen-prompt">Какое направление тебе интереснее?</p>
            <div className="ov-teen-pref-pair">
              {[{ profession: left }, { profession: right }].map(({ profession }) => (
                <button key={profession.id} className="ov-teen-pref-card" onClick={() => pick(profession.id)} type="button">
                  <strong>{profession.title}</strong>
                  <span>{profession.sphere}</span>
                </button>
              ))}
            </div>
            <div className="ov-teen-nav">
              <button className="ov-teen-back" disabled={prefIndex === 0} onClick={goBackPref} type="button">← Назад</button>
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
        body: JSON.stringify({ report }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "t-skills-teen-report.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("Не удалось скачать PDF. Попробуйте позже.");
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
        <button className="ov-back-link" onClick={onHome} type="button">← На главную</button>
        <p className="ov-eyebrow">Твой результат</p>
        <h1 className="ov-teen-report-title">Направления, где твои качества раскрываются сильнее</h1>
        {report ? (
          <>
            <div className="ov-teen-careers">
              {report.careers.map((career, index) => (
                <article key={career.professionId} className="ov-teen-career-card">
                  <span className="ov-teen-career-rank">{index + 1}</span>
                  <div>
                    <h2>{career.title}</h2>
                    <p className="ov-teen-career-meta">{career.sphere}{career.education ? ` · ${career.education}` : ""}</p>
                    <p>{career.description}</p>
                  </div>
                </article>
              ))}
            </div>
            <h2 className="ov-teen-section-title">Твои топ-качества</h2>
            <ol className="ov-teen-traits">
              {report.topTraits.map((trait) => (
                <li key={trait.traitId}>
                  <span>{trait.name}</span>
                  <span className="ov-teen-trait-bar"><span style={{ width: `${Math.round(((trait.normalized + 1) / 2) * 100)}%` }} /></span>
                </li>
              ))}
            </ol>
            {report.topValues.length > 0 ? (
              <p className="ov-teen-echo">Важно для тебя: {report.topValues.map((value) => value.name).join(" · ")}</p>
            ) : null}
            {pdfError ? <p className="ov-form-error">{pdfError}</p> : null}
            <div className="ov-teen-report-actions">
              <button className="ov-btn ov-btn-primary" disabled={pdfBusy} onClick={() => void downloadPdf()} type="button">
                {pdfBusy ? "Готовим PDF…" : "Скачать PDF"}
              </button>
              <button className="ov-teen-skip" onClick={restart} type="button">Пройти заново</button>
            </div>
            <p className="ov-teen-draft-note">Пилотная версия банка ({report.contentStatus}). Результат развивающий, а не диагноз.</p>
          </>
        ) : (
          <p>Заполни онбординг, чтобы увидеть подборку.</p>
        )}
      </div>
    </div>
  );
}
