"use client";

import { useState } from "react";
import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import {
  TEEN_SUBJECTS,
  defaultTeenValueRanking,
  moveTeenValue,
  teenSubjectLabels,
  teenValueLabels,
  toggleTeenSubject,
  validateTeenOnboarding,
} from "@/lib/t-skills/teen/onboarding-content";
import { TEEN_UI, type TeenLocale } from "@/lib/t-skills/teen/ui-strings";
import type { TeenOnboarding, TeenSubjectId, TeenValueId } from "@/lib/t-skills/teen/taxonomy";

export type TeenOnboardingViewProps = {
  initial?: TeenOnboarding | null;
  locale?: TeenLocale;
  busy?: boolean;
  error?: string;
  onSubmit: (value: TeenOnboarding) => Promise<void>;
  onSkip?: () => void;
  onBack: () => void;
  backLabel?: string;
  headerExtra?: React.ReactNode;
};

export function TeenOnboardingView({ initial, locale = "ru", busy = false, error, onSubmit, onSkip, onBack, backLabel, headerExtra }: TeenOnboardingViewProps) {
  const strings = TEEN_UI[locale];
  const valueLabels = teenValueLabels(locale);
  const subjectLabels = teenSubjectLabels(locale);
  const [ranking, setRanking] = useState<TeenValueId[]>(initial?.valueRanking ?? defaultTeenValueRanking());
  const [subjects, setSubjects] = useState<TeenSubjectId[]>(initial?.subjects ?? []);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string>();

  const submit = async () => {
    const problem = validateTeenOnboarding({ valueRanking: ranking, subjects }, locale);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(undefined);
    await onSubmit({ valueRanking: ranking, subjects });
  };

  const dropAt = (to: number) => {
    if (dragFrom === null) return;
    setRanking((current) => moveTeenValue(current, dragFrom, to));
    setDragFrom(null);
  };

  return (
    <div className="orbita-view ov-onboarding">
      <div className="ov-container ov-container-narrow">
        <div className="ov-teen-report-top">
          <button className="ov-back-link" onClick={onBack} type="button">{backLabel ?? strings.back}</button>
          {headerExtra}
        </div>
        <SectionHeading
          level={1}
eyebrow={strings.onboardingEyebrow}
          title={strings.onboardingTitle}
          body={strings.onboardingBody}
        />
        <article className="ov-card ov-onboarding-card">
          <h2 className="ov-teen-step-title">{strings.step1Title}</h2>
          <p className="ov-teen-step-hint">{strings.step1Hint}</p>
          <ol className="ov-teen-ranking">
            {ranking.map((valueId, index) => (
              <li
                key={valueId}
                className={`ov-teen-rank-item${index < 3 ? " ov-teen-rank-top" : ""}${dragFrom === index ? " ov-teen-rank-dragging" : ""}`}
                draggable
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropAt(index)}
              >
                <span className="ov-teen-rank-pos">{index + 1}</span>
                <span className="ov-teen-rank-label">{valueLabels[valueId]}</span>
                <span className="ov-teen-rank-actions">
                  <button aria-label="↑" disabled={index === 0} onClick={() => setRanking((current) => moveTeenValue(current, index, index - 1))} type="button">↑</button>
                  <button aria-label="↓" disabled={index === ranking.length - 1} onClick={() => setRanking((current) => moveTeenValue(current, index, index + 1))} type="button">↓</button>
                </span>
              </li>
            ))}
          </ol>

          <h2 className="ov-teen-step-title">{strings.step2Title}</h2>
          <p className="ov-teen-step-hint">{strings.subjectsHint(subjects.length)}</p>
          <div className="ov-teen-subjects">
            {TEEN_SUBJECTS.map((subjectId) => {
              const selected = subjects.includes(subjectId);
              return (
                <button
                  key={subjectId}
                  className={`ov-teen-subject${selected ? " selected" : ""}`}
                  onClick={() => setSubjects((current) => toggleTeenSubject(current, subjectId))}
                  type="button"
                >
                  {subjectLabels[subjectId]}
                </button>
              );
            })}
          </div>

          {localError || error ? <p className="ov-form-error">{localError ?? error}</p> : null}
          <button className="ov-btn ov-btn-primary ov-btn-block" disabled={busy} onClick={() => void submit()} type="button">
            {busy ? strings.saving : strings.goToQuestions}
            <ArrowRight />
          </button>
          {onSkip ? (
            <button className="ov-teen-skip" disabled={busy} onClick={onSkip} type="button">
              {strings.skipOnboarding}
            </button>
          ) : null}
        </article>
      </div>
    </div>
  );
}
