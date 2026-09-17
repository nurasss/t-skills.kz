"use client";

import { useEffect } from "react";
import type { AssessmentItem, Phase } from "@/app/orbita-view-types";

const RESPONSE_LABELS = ["Сильно левое", "Скорее левое", "Одинаково", "Скорее правое", "Сильно правое"];
const LIKERT_LABELS = ["1", "2", "3", "4", "5", "6", "7"];

function assessmentItemKey(item: AssessmentItem) {
  return "questionId" in item ? item.questionId : item.id;
}

function isForced(item: AssessmentItem): boolean {
  return (
    ("type" in item && (item.type === "forced" || item.type === "adaptive_forced")) ||
    ("format" in item && item.format === "forced_choice")
  );
}

function QuestionScale({ item, value, onChange }: { item: AssessmentItem; value?: number; onChange: (value: number) => void }) {
  if (isForced(item)) {
    const left = "options" in item ? item.options[0]?.text ?? "" : "left" in item ? item.left : "";
    const right = "options" in item ? item.options[1]?.text ?? "" : "right" in item ? item.right : "";
    return (
      <div className="ov-assessment-forced">
        <div className="ov-assessment-statements">
          <div className="ov-assessment-statement ov-assessment-statement-left">
            <span>Левый стиль</span>
            <p>{left}</p>
          </div>
          <span className="ov-assessment-versus">vs</span>
          <div className="ov-assessment-statement ov-assessment-statement-right">
            <span>Правый стиль</span>
            <p>{right}</p>
          </div>
        </div>
        <div className="ov-assessment-scale-labels">
          <span>чаще левое</span>
          <span>одинаково</span>
          <span>чаще правое</span>
        </div>
        <div className="ov-assessment-scale ov-assessment-scale-forced" role="radiogroup" aria-label="Выберите, какое утверждение чаще про вас">
          {[-2, -1, 0, 1, 2].map((option, index) => (
            <label
              className={`ov-scale-option${value === option ? " selected" : ""}`}
              key={option}
            >
              <input className="ov-radio-input" type="radio" name={`forced-${assessmentItemKey(item)}`} value={option} checked={value === option} onChange={() => onChange(option)} />
              <span className="ov-scale-dot" />
              <small>{RESPONSE_LABELS[index]}</small>
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
      <div className="ov-assessment-scale ov-assessment-scale-likert" role="radiogroup" aria-label="Оцените типичное поведение от 1 до 7">
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
      <p className="ov-assessment-hint">Выбирайте то, что чаще проявляется без внешнего принуждения.</p>
    </div>
  );
}

export type AssessmentViewProps = {
  phase: Phase;
  item?: AssessmentItem;
  currentIndex: number;
  total: number;
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
  blockNumber,
  selectedValue,
  onAnswer,
  onNext,
  onPause,
  autosaveStatus,
  elapsedSeconds,
}: AssessmentViewProps) {
  useRevealOnScroll();

  if (!item) return null;

  const localCoreQuestion = currentIndex + 1;
  const localAdaptiveQuestion = phase === "adaptive" ? currentIndex + 1 : localCoreQuestion;
  const blockLabel = phase === "core" ? (total === 60 ? "Основная часть" : `Блок ${blockNumber} из 5`) : "Уточняющая часть";
  const softCue = elapsedSeconds >= 30;

  return (
    <div className="orbita-view ov-assessment ov-assessment-immersive">
      <header className="ov-assessment-topbar">
        <div className="ov-assessment-topbar-progress">
          <span className="ov-eyebrow">{blockLabel}</span>
          <strong>
            Вопрос {phase === "core" ? localCoreQuestion : localAdaptiveQuestion} из {total}
          </strong>
        </div>
        <div className="ov-assessment-progress">
          <div className="ov-assessment-progress-track">
            <span style={{ width: `${Math.round(((currentIndex + 1) / total) * 100)}%` }} />
          </div>
          <span className="ov-assessment-progress-num">{Math.round(((currentIndex + 1) / total) * 100)}%</span>
        </div>
        <div className="ov-assessment-topbar-actions">
          <span className="ov-assessment-autosave">
            <span className="ov-status-dot" />
            {autosaveStatus}
          </span>
          <button className="ov-btn ov-btn-ghost ov-btn-sm" onClick={onPause} type="button">
            Пауза
          </button>
        </div>
      </header>

      <main className="ov-assessment-main">
        <div className="ov-container ov-container-narrow">
          <div className="ov-question-meta">
            <span>{phase === "core" ? "Типичное поведение" : "Уточняющий вопрос"}</span>
            <span className="ov-question-id">
              {"questionId" in item ? item.questionId : item.id}
            </span>
          </div>

          <h1 className="ov-question-prompt">
            {isForced(item)
              ? "format" in item && item.format === "forced_choice"
                ? item.prompt
                : "Что чаще описывает вас в сложной ситуации?"
              : "questionId" in item
                ? item.prompt
                : "Насколько это обычно про вас?"}
          </h1>

          <p className="ov-question-instruction">
            {isForced(item)
              ? "Выберите сторону, которая чаще описывает вас. Если обе подходят одинаково — выберите середину."
              : "Оценивайте типичное поведение за последние 1–2 года, а не идеальный образ себя."}
          </p>

          <QuestionScale item={item} value={selectedValue} onChange={onAnswer} />

          <div className="ov-question-footer">
            <div className="ov-soft-timer">
              <TimerIcon />
              <span>
                {softCue
                  ? "Отвечайте скорее по типичному поведению."
                  : "Мягкий ориентир времени · без автоперехода"}
              </span>
            </div>
            <button
              className="ov-btn ov-btn-primary"
              disabled={typeof selectedValue !== "number"}
              onClick={onNext}
              type="button"
            >
              {currentIndex + 1 === total ? "Завершить блок" : "Сохранить и продолжить"}
            </button>
          </div>

          <div className="ov-question-privacy">
            <ShieldIcon />
            Названия шкал и «правильность» ответа не показываются.
          </div>
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
