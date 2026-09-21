/**
 * Teen-онбординг: контент и чистая логика (ранжирование ценностей, выбор предметов).
 * UI — app/views/onboarding/teen-onboarding-view.tsx.
 */
import {
  TEEN_SUBJECTS,
  TEEN_VALUES,
  type TeenOnboarding,
  type TeenSubjectId,
  type TeenValueId,
} from "@/lib/t-skills/teen/taxonomy";
import { TEEN_SUBJECT_LABELS_KK, TEEN_VALUE_LABELS_KK, TEEN_UI, type TeenLocale } from "@/lib/t-skills/teen/ui-strings";

export const TEEN_VALUE_LABELS: Record<TeenValueId, string> = {
  stability: "Стабильность",
  income: "Доход",
  growth: "Рост и развитие",
  "value-autonomy": "Самостоятельность",
  "social-impact": "Польза людям",
  "creative-freedom": "Творческая свобода",
  status: "Статус и признание",
  "work-life-balance": "Баланс учёбы и жизни",
};

export function teenValueLabels(locale: TeenLocale = "ru"): Record<TeenValueId, string> {
  return locale === "kk" ? TEEN_VALUE_LABELS_KK : TEEN_VALUE_LABELS;
}

export function teenSubjectLabels(locale: TeenLocale = "ru"): Record<TeenSubjectId, string> {
  return locale === "kk" ? TEEN_SUBJECT_LABELS_KK : TEEN_SUBJECT_LABELS;
}

export const TEEN_SUBJECT_LABELS: Record<TeenSubjectId, string> = {
  math: "Математика",
  physics: "Физика",
  chemistry: "Химия",
  biology: "Биология",
  geography: "География",
  informatics: "Информатика",
  history: "История",
  "social-studies": "Обществознание / право",
  kazakh: "Казахский язык и литература",
  russian: "Русский язык и литература",
  english: "Английский язык",
  creative: "Творческие предметы",
  pe: "Физкультура",
  pedagogy: "Педагогика",
};

export const TEEN_SUBJECTS_MIN = 2;
export const TEEN_SUBJECTS_MAX = 3;

export function defaultTeenValueRanking(): TeenValueId[] {
  return [...TEEN_VALUES];
}

/** Перемещение элемента в ранжировании (drag-and-drop и кнопки ↑↓). */
export function moveTeenValue(ranking: readonly TeenValueId[], from: number, to: number): TeenValueId[] {
  if (from < 0 || from >= ranking.length || to < 0 || to >= ranking.length || from === to) return [...ranking];
  const next = [...ranking];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Тоггл предмета: снять всегда можно, добавить — только если выбрано меньше максимума. */
export function toggleTeenSubject(selected: readonly TeenSubjectId[], id: TeenSubjectId): TeenSubjectId[] {
  if (selected.includes(id)) return selected.filter((subject) => subject !== id);
  if (selected.length >= TEEN_SUBJECTS_MAX) return [...selected];
  return [...selected, id];
}

export function validateTeenOnboarding(
  value: Pick<TeenOnboarding, "valueRanking" | "subjects">,
  locale: TeenLocale = "ru",
): string | null {
  const strings = TEEN_UI[locale];
  if (value.valueRanking.length !== TEEN_VALUES.length || new Set(value.valueRanking).size !== TEEN_VALUES.length) {
    return strings.errRanking;
  }
  if (value.subjects.length < TEEN_SUBJECTS_MIN || value.subjects.length > TEEN_SUBJECTS_MAX) {
    return strings.errSubjects;
  }
  return null;
}

export { TEEN_SUBJECTS, TEEN_VALUES };
