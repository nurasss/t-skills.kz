"use client";

import { useState } from "react";
import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import type { OnboardingContext } from "@/lib/t-skills/contracts";
import { useSiteLang, SiteLangToggle } from "@/lib/site-lang";
import { OB_STRINGS } from "@/lib/site-strings";

export type OnboardingViewProps = {
  initial?: OnboardingContext | null;
  busy?: boolean;
  error?: string;
  onSubmit: (value: OnboardingContext) => Promise<void>;
  onBack: () => void;
};

export function OnboardingView({ initial, busy = false, error, onSubmit, onBack }: OnboardingViewProps) {
  const [lang, setLang] = useSiteLang();
  const t = OB_STRINGS[lang];
  const eduValues = ["school", "college", "university", "vocational", "other"];
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  const [educationLevel, setEducationLevel] = useState(initial?.educationLevel ?? "school");
  const [subjects, setSubjects] = useState(initial?.favoriteSubjects.join(", ") ?? "");
  const [localError, setLocalError] = useState<string>();

  const submit = async () => {
    const parsedAge = Number(age);
    const favoriteSubjects = subjects.split(",").map((subject) => subject.trim()).filter(Boolean);
    if (!Number.isInteger(parsedAge) || parsedAge < 10 || parsedAge > 100) {
      setLocalError(t.errAge);
      return;
    }
    if (!educationLevel.trim() || favoriteSubjects.length === 0) {
      setLocalError(t.errEdu);
      return;
    }
    setLocalError(undefined);
    await onSubmit({ age: parsedAge, educationLevel, favoriteSubjects });
  };

  return (
    <div className="orbita-view ov-onboarding">
      <div className="ov-container ov-container-narrow">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="ov-back-link" onClick={onBack} type="button">{t.back}</button>
          <SiteLangToggle lang={lang} onLang={setLang} />
        </div>
        <SectionHeading
          eyebrow={t.eyebrow}
          title={t.title}
          body={t.body}
        />
        <article className="ov-card ov-onboarding-card">
          <div className="ov-form-grid">
            <label className="ov-form-field">
              <span>{t.age}</span>
              <input className="ov-form-input" inputMode="numeric" min={10} max={100} type="number" value={age} onChange={(event) => setAge(event.target.value)} />
            </label>
            <label className="ov-form-field">
              <span>{t.edu}</span>
              <select className="ov-form-input" value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)}>
                {eduValues.map((value, i) => (
                  <option key={value} value={value}>{t.eduOpts[i]}</option>
                ))}
              </select>
            </label>
            <label className="ov-form-field ov-form-field-wide">
              <span>{t.subjects}</span>
              <input className="ov-form-input" placeholder={t.subjectsPh} value={subjects} onChange={(event) => setSubjects(event.target.value)} />
              <small>{t.subjectsHelp}</small>
            </label>
          </div>
          {localError || error ? <p className="ov-form-error">{localError ?? error}</p> : null}
          <button className="ov-btn ov-btn-primary ov-btn-block" disabled={busy} onClick={() => void submit()} type="button">
            {busy ? t.saving : t.go}
            <ArrowRight />
          </button>
        </article>
      </div>
    </div>
  );
}
