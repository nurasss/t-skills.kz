"use client";

import { useEffect } from "react";
import type { AssessmentItem, Phase } from "@/app/orbita-view-types";
import type { AdaptiveQuestion, PairwiseItem } from "@/lib/t-skills/contracts";
import { useSiteLang, SiteLangToggle } from "@/lib/site-lang";
import { AS_STRINGS } from "@/lib/site-strings";
import { localizeAssessmentItem } from "@/lib/adult-kk";
import { TraitIcon } from "@/app/views/assessment/trait-icons";

const LIKERT_LABELS = ["1", "2", "3", "4", "5", "6", "7"];

function assessmentItemKey(item: AssessmentItem) {
  return "questionId" in item ? item.questionId : item.id;
}

function isPairwise(item: AssessmentItem): item is PairwiseItem {
  return "leftText" in item && "rightText" in item && "leftTraitId" in item;
}

function isCareerQuestion(item: AssessmentItem): item is AdaptiveQuestion {
  return "options" in item && item.options.length === 4 && "prompt" in item && !isPairwise(item);
}

function isForced(item: AssessmentItem): boolean {
  return (
    ("type" in item && (item.type === "forced" || item.type === "adaptive_forced")) ||
    ("format" in item && item.format === "forced_choice")
  );
}

function QuestionScale({ item, value, onChange, t, lang }: { item: AssessmentItem; value?: number; onChange: (value: number) => void; t: (typeof AS_STRINGS)["ru"]; lang: "ru" | "kk" }) {
  const d = localizeAssessmentItem(item, lang) as typeof item;
  if (isPairwise(item)) {
    return (
      <div className="ov-assessment-pairwise">
        <div className="ov-assessment-pairwise-choices">
          <div className="ov-pairwise-card ov-pairwise-card-left">
            <span className="ov-pairwise-medallion" aria-hidden="true">
              <TraitIcon traitId={item.leftTraitId} />
            </span>
            <p className="ov-assessment-pairwise-statement ov-assessment-pairwise-statement-left">
              <span className="ov-assessment-pairwise-statement-label">{t.leftSt}</span>
              {(d as { leftText: string }).leftText}
            </p>
          </div>
          <div className="ov-assessment-pairwise-scale-wrap">
            <div className="ov-assessment-pairwise-scale-legend" aria-hidden="true">
              <span>{t.closerL}</span>
              <span>{t.closerR}</span>
            </div>
            <div className="ov-assessment-scale ov-assessment-scale-forced ov-assessment-pairwise-scale" role="radiogroup" aria-label={t.pairwiseAria}>
              {[-2, -1, 0, 1, 2].map((option, index) => (
                <label className={`ov-scale-option ov-pairwise-dot-option${value === option ? " selected" : ""}`} key={option}>
                  <input className="ov-radio-input" type="radio" name={`pairwise-${assessmentItemKey(item)}`} value={option} checked={value === option} aria-label={t.resp[index]} onChange={() => onChange(option)} />
                  <span className="ov-scale-dot" />
                </label>
              ))}
            </div>
          </div>
          <div className="ov-pairwise-card ov-pairwise-card-right">
            <span className="ov-pairwise-medallion" aria-hidden="true">
              <TraitIcon traitId={item.rightTraitId} />
            </span>
            <p className="ov-assessment-pairwise-statement ov-assessment-pairwise-statement-right">
              <span className="ov-assessment-pairwise-statement-label">{t.rightSt}</span>
              {(d as { rightText: string }).rightText}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isCareerQuestion(item)) {
    return (
      <div className="ov-assessment-career-options" role="radiogroup" aria-label={t.careerAria}>
        {item.options.map((option, index) => (
          <label className={`ov-career-option${value === index ? " selected" : ""}`} key={option.id}>
            <input className="ov-radio-input" type="radio" name={`career-${assessmentItemKey(item)}`} value={index} checked={value === index} aria-label={`${option.id}. ${option.text}`} onChange={() => onChange(index)} />
            <span className="ov-career-option-id">{option.id}</span>
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    );
  }

  if (isForced(item)) {
    const dOpts = "options" in d && Array.isArray((d as { options?: unknown }).options)
      ? (d as { options: { text: string }[] }).options
      : null;
    const left = dOpts ? dOpts[0]?.text ?? "" : "options" in item ? item.options[0]?.text ?? "" : "left" in item ? item.left : "";
    const right = dOpts ? dOpts[1]?.text ?? "" : "options" in item ? item.options[1]?.text ?? "" : "right" in item ? item.right : "";
    return (
      <div className="ov-assessment-forced">
        <div className="ov-assessment-statements">
          <div className="ov-assessment-statement ov-assessment-statement-left">
            <span>{t.leftStyle}</span>
            <p>{left}</p>
          </div>
          <span className="ov-assessment-versus">vs</span>
          <div className="ov-assessment-statement ov-assessment-statement-right">
            <span>{t.rightStyle}</span>
            <p>{right}</p>
          </div>
        </div>
        <div className="ov-assessment-scale-labels">
          <span>{t.oftenL}</span>
          <span>{t.same}</span>
          <span>{t.oftenR}</span>
        </div>
        <div className="ov-assessment-scale ov-assessment-scale-forced" role="radiogroup" aria-label={t.forcedAria}>
          {[-2, -1, 0, 1, 2].map((option, index) => (
            <label
              className={`ov-scale-option${value === option ? " selected" : ""}`}
              key={option}
            >
              <input className="ov-radio-input" type="radio" name={`forced-${assessmentItemKey(item)}`} value={option} checked={value === option} onChange={() => onChange(option)} />
              <span className="ov-scale-dot" />
              <small>{t.resp[index]}</small>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ov-assessment-likert">
      <div className="ov-assessment-scale-labels">
        <span>1 · совсем не про меня</span>
        <span>4 · зависит</span>
        <span>7 · полностью про меня</span>
      </div>
      <div className="ov-assessment-scale ov-assessment-scale-likert" role="radiogroup" aria-label={t.likertAria}>
        {LIKERT_LABELS.map((label, index) => {
          const option = index + 1;
          return (
            <label
              className={`ov-likert-option${value === option ? " selected" : ""}`}
              key={label}
            >
              <input className="ov-radio-input" type="radio" name={`likert-${assessmentItemKey(item)}`} value={option} checked={value === option} onChange={() => onChange(option)} />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
      <p className="ov-assessment-hint">{t.likertHint}</p>
    </div>
  );
}

export type AssessmentViewProps = {
  phase: Phase;
  item?: AssessmentItem;
  currentIndex: number;
  total: number;
  overallTotal?: number;
  questionOffset?: number;
  blockNumber: number;
  selectedValue?: number;
  onAnswer: (value: number) => void;
  onNext: () => void;
  onPause: () => void;
  autosaveStatus: string;
  elapsedSeconds: number;
};

export function AssessmentView({
  phase,
  item,
  currentIndex,
  total,
  overallTotal,
  questionOffset = 0,
  blockNumber,
  selectedValue,
  onAnswer,
  onNext,
  onPause,
  autosaveStatus,
  elapsedSeconds,
}: AssessmentViewProps) {
  const [lang, setLang] = useSiteLang();
  const t = AS_STRINGS[lang];
  useRevealOnScroll();

  if (!item) return null;

  const localCoreQuestion = currentIndex + 1;
  const localAdaptiveQuestion = phase === "adaptive" ? currentIndex + 1 : localCoreQuestion;
  const pairwiseQuestion = isPairwise(item);
  const displayQuestion = questionOffset + (phase === "core" ? localCoreQuestion : localAdaptiveQuestion);
  const displayItem = localizeAssessmentItem(item, lang);
  const displayPrompt = "prompt" in displayItem && typeof (displayItem as { prompt?: unknown }).prompt === "string"
    ? (displayItem as { prompt: string }).prompt
    : null;
  const displayTotal = overallTotal ?? total;
  const progressPercent = Math.round((displayQuestion / displayTotal) * 100);
  const blockLabel = phase === "core" ? (total === 60 || total === 67 || total === 75 ? t.mainPart : t.blockN(blockNumber)) : t.careerClar;
  const softCue = elapsedSeconds >= 30;

  return (
    <div className={`orbita-view ov-assessment ov-assessment-immersive${pairwiseQuestion ? " ov-assessment-pairwise-screen" : ""}`}>
      <header className="ov-assessment-topbar">
        <div className="ov-assessment-topbar-progress">
          <span className="ov-eyebrow">{blockLabel}</span>
          <strong>
            Вопрос {displayQuestion} из {displayTotal}
          </strong>
        </div>
        <div className="ov-assessment-progress">
          <div className="ov-assessment-progress-track">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="ov-assessment-progress-num">{progressPercent}%</span>
        </div>
        <div className="ov-assessment-topbar-actions">
          <span className="ov-assessment-autosave">
            <span className="ov-status-dot" />
            {autosaveStatus}
          </span>
          <SiteLangToggle lang={lang} onLang={setLang} />
          <button className="ov-btn ov-btn-ghost ov-btn-sm" onClick={onPause} type="button">
            {t.pause}
          </button>
        </div>
      </header>

      <main className="ov-assessment-main">
        {/* key перезапускает лёгкую анимацию появления вопроса */}
        <div key={displayQuestion} className={`ov-container ov-container-narrow ov-question-enter${pairwiseQuestion ? " ov-assessment-pairwise-card" : ""}`}>
          <div className="ov-question-meta">
            <span>{phase === "core" ? (isPairwise(item) ? t.compareSt : t.typicalBeh) : t.careerCl2}</span>
            <span className="ov-question-id">
              {"questionId" in item ? item.questionId : item.id}
            </span>
          </div>

          <h1 className="ov-question-prompt">
            {isCareerQuestion(item)
              ? item.prompt
              : isPairwise(item)
                ? t.whatCloser
                : isForced(item)
              ? "format" in item && item.format === "forced_choice"
                ? (displayPrompt ?? item.prompt)
                : t.whatOften
              : "questionId" in item
                ? item.prompt
                : t.howUsual}
          </h1>

          <p className="ov-question-instruction">
            {isCareerQuestion(item)
              ? t.instrCareer
              : isPairwise(item)
                ? t.instrPair
                : isForced(item)
              ? t.instrForced
              : t.instrLikert}
          </p>

          <QuestionScale item={item} value={selectedValue} onChange={onAnswer} t={t} lang={lang} />

          <div className="ov-question-footer">
            <div className="ov-soft-timer">
              {pairwiseQuestion ? <InfoIcon /> : <TimerIcon />}
              <span>
                {pairwiseQuestion || softCue
                  ? t.answerTypical
                  : t.softTimer}
              </span>
            </div>
            <button
              className="ov-btn ov-btn-primary"
              disabled={typeof selectedValue !== "number"}
              onClick={onNext}
              type="button"
            >
              {currentIndex + 1 === total ? t.finishBlock : t.saveContinue}
            </button>
          </div>

          {!pairwiseQuestion ? (
            <div className="ov-question-privacy">
              <ShieldIcon />
              {t.privacyNote}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function TimerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <circle cx="12" cy="7" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z" strokeLinejoin="round" />
    </svg>
  );
}

function useRevealOnScroll() {
  useEffect(() => {
    const root = document.querySelector(".orbita-view");
    if (!root) return;
    const elements = root.querySelectorAll<HTMLElement>(".ov-reveal");
    elements.forEach((el) => el.classList.add("is-visible"));
  }, []);
}
