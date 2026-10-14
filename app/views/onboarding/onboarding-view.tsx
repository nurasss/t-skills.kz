"use client";

import { useState } from "react";
import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import type { OnboardingContext } from "@/lib/t-skills/contracts";
import { useSiteLang } from "@/lib/site-lang";
import { OB_STRINGS } from "@/lib/site-strings";
import { defaultTeenValueRanking, moveTeenValue } from "@/lib/t-skills/teen/onboarding-content";
import { TEEN_ONBOARDING_SUBJECTS, TEEN_ONBOARDING_SUBJECTS_MAX, TEEN_ONBOARDING_SUBJECTS_MIN } from "@/lib/t-skills/teen/runtime";
import { TEEN_VALUES, type TeenValueId } from "@/lib/t-skills/teen/taxonomy";

const TOP_VALUES = 3;

export type OnboardingViewProps = {
  initial?: OnboardingContext | null;
  busy?: boolean;
  error?: string;
  onSubmit: (value: OnboardingContext) => Promise<void>;
  onBack: () => void;
};

function initialRanking(initial?: OnboardingContext | null): TeenValueId[] {
  const saved = (initial?.valueRanking ?? []).filter((value): value is TeenValueId => (TEEN_VALUES as readonly string[]).includes(value));
  return saved.length === TEEN_VALUES.length && new Set(saved).size === TEEN_VALUES.length ? saved : defaultTeenValueRanking();
}

export function OnboardingView({ initial, busy = false, error, onSubmit, onBack }: OnboardingViewProps) {
  const [lang] = useSiteLang();
  const t = OB_STRINGS[lang];
  const eduValues = ["school", "college", "university", "vocational", "other"];
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  const [educationLevel, setEducationLevel] = useState(initial?.educationLevel ?? "school");
  const [ranking, setRanking] = useState<TeenValueId[]>(() => initialRanking(initial));
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<string[]>(() => (initial?.favoriteSubjects ?? [])
    .filter((subject, index, list) => (TEEN_ONBOARDING_SUBJECTS as readonly string[]).includes(subject) && list.indexOf(subject) === index)
    .slice(0, TEEN_ONBOARDING_SUBJECTS_MAX));
  const [localError, setLocalError] = useState<string>();

  const toggleSubject = (value: string) => {
    setSubjects((current) => current.includes(value)
      ? current.filter((subject) => subject !== value)
      : current.length >= TEEN_ONBOARDING_SUBJECTS_MAX ? current : [...current, value]);
  };

  const dropAt = (to: number) => {
    if (dragFrom === null) return;
    setRanking((current) => moveTeenValue(current, dragFrom, to));
    setDragFrom(null);
  };

  const submit = async () => {
    const parsedAge = Number(age);
    if (!Number.isInteger(parsedAge) || parsedAge < 10 || parsedAge > 100) {
      setLocalError(t.errAge);
      return;
    }
    if (!educationLevel.trim()) {
      setLocalError(t.errEdu);
      return;
    }
    if (subjects.length < TEEN_ONBOARDING_SUBJECTS_MIN || subjects.length > TEEN_ONBOARDING_SUBJECTS_MAX) {
      setLocalError(t.errSubjects);
      return;
    }
    setLocalError(undefined);
    await onSubmit({ age: parsedAge, educationLevel, favoriteSubjects: subjects, valueRanking: ranking });
  };

  return (
    <main className="orbita-view ov-onboarding">
      <div className="ov-container ov-container-narrow">
        <button className="ov-back-link" onClick={onBack} type="button">{t.back}</button>
        <SectionHeading
          level={1}
          eyebrow={t.eyebrow}
          title={t.title}
          body={t.body}
        />
        <article className="ov-card ov-onboarding-card">
          <div className="ov-form-grid">
            <label className="ov-form-field">
              <span>{t.age}</span>
              <input id="onboarding-age" name="age" autoComplete="off" className="ov-form-input" inputMode="numeric" min={10} max={100} type="number" value={age} onChange={(event) => setAge(event.target.value)} />
            </label>
            <label className="ov-form-field">
              <span>{t.edu}</span>
              <select id="onboarding-education" name="education_level" autoComplete="off" className="ov-form-input" value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)}>
                {eduValues.map((value, i) => (
                  <option key={value} value={value}>{t.eduOpts[i]}</option>
                ))}
              </select>
            </label>
            <div className="ov-form-field ov-form-field-wide" role="group" aria-labelledby="ov-values-label">
              <span id="ov-values-label">{t.values}</span>
              <small>{t.valuesHelp}</small>
              <ol className="ov-value-ranking">
                {ranking.map((valueId, index) => (
                  <li
                    key={valueId}
                    className={`ov-value-rank${index < TOP_VALUES ? " top" : ""}${dragFrom === index ? " dragging" : ""}`}
                    draggable
                    onDragStart={() => setDragFrom(index)}
                    onDragEnd={() => setDragFrom(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropAt(index)}
                  >
                    <span className="ov-value-rank-pos">{index + 1}</span>
                    <span className="ov-value-rank-label">{t.valueOpts[valueId]}</span>
                    <span className="ov-value-rank-actions">
                      <button aria-label={`${t.moveUp}: ${t.valueOpts[valueId]}`} disabled={index === 0} onClick={() => setRanking((current) => moveTeenValue(current, index, index - 1))} type="button">↑</button>
                      <button aria-label={`${t.moveDown}: ${t.valueOpts[valueId]}`} disabled={index === ranking.length - 1} onClick={() => setRanking((current) => moveTeenValue(current, index, index + 1))} type="button">↓</button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="ov-form-field ov-form-field-wide" role="group" aria-labelledby="ov-subjects-label">
              <span id="ov-subjects-label">{t.subjects}</span>
              <div className="ov-subject-chips">
                {TEEN_ONBOARDING_SUBJECTS.map((value) => {
                  const selected = subjects.includes(value);
                  return (
                    <button
                      key={value}
                      aria-pressed={selected}
                      className={`ov-subject-chip${selected ? " selected" : ""}`}
                      disabled={!selected && subjects.length >= TEEN_ONBOARDING_SUBJECTS_MAX}
                      onClick={() => toggleSubject(value)}
                      type="button"
                    >
                      {t.subjectOpts[value]}
                    </button>
                  );
                })}
              </div>
              <small>{t.subjectsHelp(subjects.length)}</small>
            </div>
          </div>
          {localError || error ? <p className="ov-form-error">{localError ?? error}</p> : null}
          <button className="ov-btn ov-btn-primary ov-btn-block" disabled={busy} onClick={() => void submit()} type="button">
            {busy ? t.saving : t.go}
            <ArrowRight />
          </button>
        </article>
      </div>
    </main>
  );
}
