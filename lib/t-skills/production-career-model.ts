import type { CareerDimensions, Profession } from "@/lib/t-skills/contracts";
import { T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";

type CareerContent = Pick<Profession, "id" | "title" | "description" | "subjectTags" | "educationPaths"> & {
  titleKk: string;
  descriptionKk: string;
  category: string;
  workEnvironment: string;
};

const profile = (weights: Record<string, number>) => Object.fromEntries(
  T_SKILLS_WORKING_TAXONOMY.map((trait) => [trait.id, weights[trait.id] ?? 0]),
) as Record<string, number>;

/** Editorial copy is versioned in D1; this is the reviewed bootstrap used to
 * seed the first production catalog.  It deliberately contains no scoring
 * configuration, so content editors cannot tune matching by editing copy. */
export const T_SKILLS_PRODUCTION_CAREER_CONTENT: readonly CareerContent[] = [
  { id: "data-analyst", title: "Аналитик данных", titleKk: "Деректер талдаушысы", description: "Исследует данные, формулирует выводы и превращает наблюдения в проверяемые решения.", descriptionKk: "Деректерді зерттеп, қорытынды жасап, байқауларды тексерілетін шешімдерге айналдырады.", category: "Аналитика", workEnvironment: "Работа с данными, гипотезами и понятными критериями качества.", subjectTags: ["математика", "информатика", "физика"], educationPaths: ["Аналитика данных", "Статистика", "Прикладная математика"] },
  { id: "software-engineer", title: "Инженер-разработчик", titleKk: "Бағдарламалық жасақтама инженері", description: "Проектирует и создаёт надёжные цифровые решения, проверяя детали и связи в системе.", descriptionKk: "Жүйедегі бөлшектер мен байланыстарды тексеріп, сенімді цифрлық шешімдерді жобалайды және жасайды.", category: "Технологии", workEnvironment: "Сложные системы, самостоятельная работа и последовательное улучшение результата.", subjectTags: ["информатика", "математика", "физика"], educationPaths: ["Программная инженерия", "Компьютерные науки", "Информационные системы"] },
  { id: "product-manager", title: "Продуктовый менеджер", titleKk: "Өнім менеджері", description: "Соединяет потребности людей, цели продукта и работу команды в ясное направление.", descriptionKk: "Адамдардың қажеттіліктерін, өнім мақсатын және команда жұмысын айқын бағытқа біріктіреді.", category: "Продукт", workEnvironment: "Неопределённость, решения на стыке пользователей, бизнеса и команды.", subjectTags: ["экономика", "информатика", "общество"], educationPaths: ["Менеджмент", "Экономика", "Информационные системы"] },
  { id: "ux-researcher", title: "UX-исследователь", titleKk: "UX-зерттеуші", description: "Изучает опыт людей, замечает закономерности и помогает команде принимать решения на фактах.", descriptionKk: "Адамдардың тәжірибесін зерттеп, заңдылықтарды байқайды және командаға фактілермен шешім қабылдауға көмектеседі.", category: "Исследования", workEnvironment: "Интервью, наблюдения, анализ поведения и объяснение выводов команде.", subjectTags: ["биология", "общество", "языки"], educationPaths: ["Психология", "Социология", "Дизайн и исследования"] },
  { id: "project-coordinator", title: "Координатор проектов", titleKk: "Жоба үйлестірушісі", description: "Организует людей, сроки и договорённости так, чтобы совместная работа двигалась к результату.", descriptionKk: "Адамдарды, мерзімдерді және келісімдерді үйлестіріп, ортақ жұмысты нәтижеге жеткізеді.", category: "Управление", workEnvironment: "Командные процессы, планы, ответственность и согласование действий.", subjectTags: ["экономика", "общество", "математика"], educationPaths: ["Управление проектами", "Менеджмент", "Бизнес-администрирование"] },
];

const MODEL_PROFILES: Record<string, { traitProfile: Record<string, number>; careerDimensions: CareerDimensions }> = {
  "data-analyst": { traitProfile: profile({ analytical: 0.95, "attention-to-detail": 0.8, "systems-thinking": 0.8, curiosity: 0.65, learning: 0.55, practicality: 0.45, planning: 0.35, communication: 0.2 }), careerDimensions: { analysis: 1, systems: 0.9, structure: 0.7, autonomy: 0.6, people: 0.3, creativity: 0.35, leadership: 0.25, communication: 0.45, uncertainty: 0.45, projectScale: 0.6 } },
  "software-engineer": { traitProfile: profile({ analytical: 0.8, "systems-thinking": 0.95, "attention-to-detail": 0.7, independence: 0.6, learning: 0.55, persistence: 0.5, practicality: 0.45, planning: 0.35 }), careerDimensions: { analysis: 0.85, systems: 1, structure: 0.7, autonomy: 0.75, people: 0.25, creativity: 0.45, leadership: 0.25, communication: 0.35, uncertainty: 0.5, projectScale: 0.65 } },
  "product-manager": { traitProfile: profile({ strategic: 0.9, leadership: 0.85, communication: 0.75, persuasion: 0.7, initiative: 0.6, adaptability: 0.55, decisiveness: 0.5, "systems-thinking": 0.45, empathy: 0.4 }), careerDimensions: { analysis: 0.6, systems: 0.7, structure: 0.55, autonomy: 0.55, people: 0.8, creativity: 0.6, leadership: 0.9, communication: 0.9, uncertainty: 0.75, projectScale: 0.8 } },
  "ux-researcher": { traitProfile: profile({ empathy: 0.95, observation: 0.85, analytical: 0.65, communication: 0.7, curiosity: 0.65, creativity: 0.45, "attention-to-detail": 0.4, teamwork: 0.4 }), careerDimensions: { analysis: 0.75, systems: 0.5, structure: 0.45, autonomy: 0.55, people: 0.95, creativity: 0.65, leadership: 0.3, communication: 0.85, uncertainty: 0.5, projectScale: 0.5 } },
  "project-coordinator": { traitProfile: profile({ organization: 0.9, planning: 0.9, responsibility: 0.85, teamwork: 0.75, communication: 0.65, discipline: 0.65, leadership: 0.55, "stress-resilience": 0.45, practicality: 0.4 }), careerDimensions: { analysis: 0.45, systems: 0.65, structure: 0.95, autonomy: 0.45, people: 0.8, creativity: 0.3, leadership: 0.7, communication: 0.8, uncertainty: 0.45, projectScale: 0.75 } },
};

export function productionCareerModel(version: string) {
  if (version !== T_SKILLS_VERSION_IDS.careerMatching) return null;
  return MODEL_PROFILES;
}

export function productionCareerCatalog(version = T_SKILLS_VERSION_IDS.careerCatalog): Profession[] {
  return T_SKILLS_PRODUCTION_CAREER_CONTENT.map((entry) => {
    const model = MODEL_PROFILES[entry.id];
    if (!model) throw new Error(`CAREER_MODEL_ENTRY_MISSING:${entry.id}`);
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      traitProfile: model.traitProfile,
      careerDimensions: model.careerDimensions,
      subjectTags: entry.subjectTags,
      educationPaths: entry.educationPaths,
      active: true,
      version,
    };
  });
}
