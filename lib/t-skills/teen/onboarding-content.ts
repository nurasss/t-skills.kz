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

export function validateTeenOnboarding(value: Pick<TeenOnboarding, "valueRanking" | "subjects">): string | null {
  if (value.valueRanking.length !== TEEN_VALUES.length || new Set(value.valueRanking).size !== TEEN_VALUES.length) {
    return "Расставьте все 8 ценностей по порядку.";
  }
  if (value.subjects.length < TEEN_SUBJECTS_MIN || value.subjects.length > TEEN_SUBJECTS_MAX) {
    return `Выберите от ${TEEN_SUBJECTS_MIN} до ${TEEN_SUBJECTS_MAX} любимых предметов.`;
  }
  return null;
}

export { TEEN_SUBJECTS, TEEN_VALUES };
