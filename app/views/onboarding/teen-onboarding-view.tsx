"use client";

import { useState } from "react";
import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import {
  TEEN_SUBJECTS,
  TEEN_SUBJECT_LABELS,
  TEEN_VALUE_LABELS,
  defaultTeenValueRanking,
  moveTeenValue,
  toggleTeenSubject,
  validateTeenOnboarding,
} from "@/lib/t-skills/teen/onboarding-content";
import type { TeenOnboarding, TeenSubjectId, TeenValueId } from "@/lib/t-skills/teen/taxonomy";

export type TeenOnboardingViewProps = {
  initial?: TeenOnboarding | null;
  busy?: boolean;
  error?: string;
  onSubmit: (value: TeenOnboarding) => Promise<void>;
  onSkip?: () => void;
  onBack: () => void;
};

export function TeenOnboardingView({ initial, busy = false, error, onSubmit, onSkip, onBack }: TeenOnboardingViewProps) {
  const [ranking, setRanking] = useState<TeenValueId[]>(initial?.valueRanking ?? defaultTeenValueRanking());
  const [subjects, setSubjects] = useState<TeenSubjectId[]>(initial?.subjects ?? []);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string>();

  const submit = async () => {
    const problem = validateTeenOnboarding({ valueRanking: ranking, subjects });
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
        <button className="ov-back-link" onClick={onBack} type="button">← Вернуться</button>
        <SectionHeading
          eyebrow="Перед тестом · 1 минута"
          title="Что для тебя важно?"
          body="Расставь ценности по порядку: сверху — самое важное. Топ-3 повлияют на подбор направлений. Затем выбери 2–3 любимых предмета."
        />
        <article className="ov-card ov-onboarding-card">
          <h3 className="ov-teen-step-title">Шаг 1 · Расставь ценности</h3>
          <p className="ov-teen-step-hint">Потяни карточку или пользуйся стрелками ↑ ↓. Первые три подсвечены — они дадут бонус в подборе.</p>
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
                <span className="ov-teen-rank-label">{TEEN_VALUE_LABELS[valueId]}</span>
                <span className="ov-teen-rank-actions">
                  <button aria-label="Выше" disabled={index === 0} onClick={() => setRanking((current) => moveTeenValue(current, index, index - 1))} type="button">↑</button>
                  <button aria-label="Ниже" disabled={index === ranking.length - 1} onClick={() => setRanking((current) => moveTeenValue(current, index, index + 1))} type="button">↓</button>
                </span>
              </li>
            ))}
          </ol>

          <h3 className="ov-teen-step-title">Шаг 2 · Любимые предметы</h3>
          <p className="ov-teen-step-hint">Выбери от 2 до 3. Выбрано: {subjects.length}.</p>
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
                  {TEEN_SUBJECT_LABELS[subjectId]}
                </button>
              );
            })}
          </div>

          {localError || error ? <p className="ov-form-error">{localError ?? error}</p> : null}
          <button className="ov-btn ov-btn-primary ov-btn-block" disabled={busy} onClick={() => void submit()} type="button">
            {busy ? "Сохраняем…" : "Перейти к вопросам"}
            <ArrowRight />
          </button>
          {onSkip ? (
            <button className="ov-teen-skip" disabled={busy} onClick={onSkip} type="button">
              Пропустить (подбор будет менее точным)
            </button>
          ) : null}
        </article>
      </div>
    </div>
  );
}
