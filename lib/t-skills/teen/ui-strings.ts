/**
 * UI-строки teen-флоу: RU (прод) + KK (DRAFT-UNREVIEWED, статус unpublished).
 * Контентные тексты (вопросы, профессии) — в content.v1.json / content.v1.kk.json.
 */
import type { TeenSubjectId, TeenValueId } from "@/lib/t-skills/teen/taxonomy";

export type TeenLocale = "ru" | "kk";

export const TEEN_VALUE_LABELS_KK: Record<TeenValueId, string> = {
  stability: "Тұрақтылық",
  income: "Табыс",
  growth: "Өсу және даму",
  "value-autonomy": "Дербестік",
  "social-impact": "Адамдарға пайда",
  "creative-freedom": "Шығармашылық еркіндік",
  status: "Мәртебе",
  "work-life-balance": "Оқу мен өмір тепе-теңдігі",
};

export const TEEN_SUBJECT_LABELS_KK: Record<TeenSubjectId, string> = {
  math: "Математика",
  physics: "Физика",
  chemistry: "Химия",
  biology: "Биология",
  geography: "География",
  informatics: "Информатика",
  history: "Тарих",
  "social-studies": "Қоғамтану / құқық",
  kazakh: "Қазақ тілі мен әдебиеті",
  russian: "Орыс тілі мен әдебиеті",
  english: "Ағылшын тілі",
  creative: "Шығармашылық пәндер",
  pe: "Дене шынықтыру",
  pedagogy: "Педагогика",
};

type TeenUiStrings = {
  onboardingEyebrow: string;
  onboardingTitle: string;
  onboardingBody: string;
  step1Title: string;
  step1Hint: string;
  step2Title: string;
  subjectsHint: (count: number) => string;
  goToQuestions: string;
  saving: string;
  skipOnboarding: string;
  errRanking: string;
  errSubjects: string;
  mainPart: string;
  questionOf: (n: number, total: number) => string;
  whatCloser: string;
  back: string;
  clarification: string;
  staticLabels: [string, string, string, string, string];
  yourResult: string;
  reportTitle: string;
  topTraits: string;
  importantToYou: string;
  downloadPdf: string;
  preparingPdf: string;
  retry: string;
  draftNote: (status: string) => string;
  pdfError: string;
  home: string;
  fillOnboarding: string;
};

export const TEEN_UI: Record<TeenLocale, TeenUiStrings> = {
  ru: {
    onboardingEyebrow: "Перед тестом · 1 минута",
    onboardingTitle: "Что для тебя важно?",
    onboardingBody: "Расставь ценности по порядку: сверху — самое важное. Топ-3 повлияют на подбор направлений. Затем выбери 2–3 любимых предмета.",
    step1Title: "Шаг 1 · Расставь ценности",
    step1Hint: "Потяни карточку или пользуйся стрелками ↑ ↓. Первые три подсвечены — они дадут бонус в подборе.",
    step2Title: "Шаг 2 · Любимые предметы",
    subjectsHint: (count) => `Выбери от 2 до 3. Выбрано: ${count}.`,
    goToQuestions: "Перейти к вопросам",
    saving: "Сохраняем…",
    skipOnboarding: "Пропустить (подбор будет менее точным)",
    errRanking: "Расставьте все 8 ценностей по порядку.",
    errSubjects: "Выберите от 2 до 3 любимых предметов.",
    mainPart: "Основная часть",
    questionOf: (n, total) => `Вопрос ${n} из ${total}`,
    whatCloser: "Что тебе ближе?",
    back: "← Назад",
    clarification: "Уточнение",
    staticLabels: ["Сильно левое", "Скорее левое", "Одинаково", "Скорее правое", "Сильно правое"],
    yourResult: "Твой результат",
    reportTitle: "Направления, где твои качества раскрываются сильнее",
    topTraits: "Твои топ-качества",
    importantToYou: "Важно для тебя",
    downloadPdf: "Скачать PDF",
    preparingPdf: "Готовим PDF…",
    retry: "Пройти заново",
    draftNote: (status) => `Пилотная версия банка (${status}). Результат развивающий, а не диагноз.`,
    pdfError: "Не удалось скачать PDF. Попробуйте позже.",
    home: "← На главную",
    fillOnboarding: "Заполни онбординг, чтобы увидеть подборку.",
  },
  kk: {
    onboardingEyebrow: "Тест алдында · 1 минут",
    onboardingTitle: "Саған не маңызды?",
    onboardingBody: "Құндылықтарды ретпен қой: жоғарыда — ең маңыздысы. Топ-3 бағыт іріктеуге әсер етеді. Сосын 2–3 сүйікті пәнді таңда.",
    step1Title: "1-қадам · Құндылықтарды ретке қой",
    step1Hint: "Карточканы сүйре немесе ↑ ↓ көрсеткіштерін қолдан. Алғашқы үшеуі жарық — олар іріктеуге бонус береді.",
    step2Title: "2-қадам · Сүйікті пәндер",
    subjectsHint: (count) => `2–3 таңда. Таңдалды: ${count}.`,
    goToQuestions: "Сұрақтарға өту",
    saving: "Сақталуда…",
    skipOnboarding: "Өткізіп жіберу (іріктеу дәлдігі төмен болады)",
    errRanking: "8 құндылықтың бәрін ретпен қой.",
    errSubjects: "2–3 сүйікті пән таңда.",
    mainPart: "Негізгі бөлім",
    questionOf: (n, total) => `Сұрақ ${n} / ${total}`,
    whatCloser: "Саған қайсысы жақынырақ?",
    back: "← Артқа",
    clarification: "Нақтылау",
    staticLabels: ["Сол жақтағы", "Көбінесе сол жақтағы", "Бірдей", "Көбінесе оң жақтағы", "Оң жақтағы"],
    yourResult: "Сенің нәтижең",
    reportTitle: "Қасиеттерің жарқырай көрінетін бағыттар",
    topTraits: "Топ-қасиеттерің",
    importantToYou: "Саған маңызды",
    downloadPdf: "PDF жүктеу",
    preparingPdf: "PDF дайындалуда…",
    retry: "Қайта өту",
    draftNote: (status) => `Банктің пилоттық нұсқасы (${status}). Нәтиже дамытушы, диагноз емес.`,
    pdfError: "PDF жүктелмеді. Кейінірек байқа.",
    home: "← Басты бетке",
    fillOnboarding: "Іріктеуді көру үшін онбордингті толтыр.",
  },
};
