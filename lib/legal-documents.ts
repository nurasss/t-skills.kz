export const PRIVACY_DOCUMENT_VERSION = "privacy-2026-09";
export const TERMS_DOCUMENT_VERSION = "terms-2026-09";

export type LegalConfig = {
  entityName: string;
  supportContact: string;
  jurisdiction: string;
  processingPurposes: string;
  dataCategories: string;
  retentionSchedule: string;
  processors: string;
  crossBorderProcessing: string;
  userRights: string;
  securitySummary: string;
  researchPolicy: string;
  marketingPolicy: string;
  reviewStatus: string;
};

export const DEFAULT_LEGAL_CONFIG: LegalConfig = {
  entityName: "ТРЕБУЕТСЯ УТВЕРЖДЕНИЕ: юридическое лицо/оператор ORBITA—30",
  supportContact: "ТРЕБУЕТСЯ НАСТРОЙКА: контакт поддержки",
  jurisdiction: "ТРЕБУЕТСЯ УТВЕРЖДЕНИЕ: применимое право и юрисдикция Республики Казахстан",
  processingPurposes: "предоставление оценки и отчёта; сохранение сессии; обработка оплаты; безопасность, аудит и устранение ошибок; отдельные исследовательские и маркетинговые цели только при соответствующем согласии",
  dataCategories: "идентификатор пользователя и контакт для аккаунта; ответы и время ответа; score/report/PDF; согласия; заказы и подтверждения оплаты; техническая и агрегированная telemetry",
  retentionSchedule: "Ответы и отчёты хранятся до удаления пользователем или до истечения настроенного срока retention (по умолчанию 365 дней для завершённых/заброшенных assessment, с отдельными исключениями для transaction records, если это требует закон).",
  processors: "ТРЕБУЕТСЯ УТВЕРЖДЕНИЕ: Sites/Cloudflare D1 и R2; Stripe Checkout; опциональный OpenAI API только при включённом провайдере",
  crossBorderProcessing: "ТРЕБУЕТСЯ УТВЕРЖДЕНИЕ: перечень трансграничных передач, страны, основания и защитные меры",
  userRights: "доступ, исправление, отзыв необязательных согласий, экспорт, удаление и обращение к оператору; конкретный порядок и сроки требуют юридического утверждения",
  securitySummary: "минимизация payload; owner-scoped access; same-origin mutation checks; rate limits; signed webhook/PDF links; managed secrets; audit без raw answers; регулярное обновление зависимостей",
  researchPolicy: "Исследовательское согласие отдельно от обязательной обработки. Без него ответы не используются для заявленных исследовательских целей, кроме агрегированной безопасности и эксплуатации, если это допускает утверждённая политика.",
  marketingPolicy: "Маркетинговое согласие отдельно и необязательно. Отказ не влияет на доступ к оценке; канал, частота и отзыв требуют утверждённой политики.",
  reviewStatus: "ТРЕБУЕТСЯ ОБЯЗАТЕЛЬНЫЙ REVIEW: текст не является юридическим заключением и должен быть проверен специалистом по праву Республики Казахстан до публичного запуска.",
};

export type LegalKind = "privacy" | "terms";
export type LegalBlock = { title: string; body: string };
export type LegalDocument = { title: string; version: string; updatedAt: string; blocks: LegalBlock[] };

export function getLegalDocument(kind: LegalKind, config: LegalConfig = DEFAULT_LEGAL_CONFIG): LegalDocument {
  if (kind === "privacy") {
    return {
      title: "Политика конфиденциальности и обработки данных",
      version: PRIVACY_DOCUMENT_VERSION,
      updatedAt: "2026-09-15",
      blocks: [
        { title: "Оператор и контакт", body: `${config.entityName}. Контакт: ${config.supportContact}. ${config.reviewStatus}` },
        { title: "Цели обработки", body: config.processingPurposes },
        { title: "Категории данных", body: config.dataCategories },
        { title: "Ответы и score", body: "Ответы нужны для расчёта профиля и отчёта в рамках выбранной версии. Сырые ответы не отправляются в AI-провайдеры; в OpenAI payload допускается только минимальный score/profile context и библиотека утверждённых смыслов, без identity и raw responses." },
        { title: "Платежи и processors", body: config.processors },
        { title: "Трансграничная обработка", body: config.crossBorderProcessing },
        { title: "Сроки хранения", body: config.retentionSchedule },
        { title: "Права пользователя", body: config.userRights },
        { title: "Экспорт и удаление", body: "В кабинете доступны запрос экспорта и удаление. Перед удалением система удаляет R2-артефакты, ответы, adaptive runs, отчёты, согласия, telemetry и rate-limit records, затем обезличивает identity; технический audit минимален и не содержит raw answers." },
        { title: "Безопасность", body: config.securitySummary },
        { title: "Исследование", body: config.researchPolicy },
        { title: "Маркетинг", body: config.marketingPolicy },
        { title: "Изменения политики", body: "Версия и дата показываются рядом с согласием. Существенные изменения требуют обновления текста согласия и, если применимо, повторного решения пользователя." },
      ],
    };
  }
  return {
    title: "Условия использования ORBITA—30",
    version: TERMS_DOCUMENT_VERSION,
    updatedAt: "2026-09-15",
    blocks: [
      { title: "Оператор и версия", body: `${config.entityName}. Версия условий: ${TERMS_DOCUMENT_VERSION}. ${config.reviewStatus}` },
      { title: "Что предоставляет сервис", body: "ORBITA—30 предоставляет интерактивную развивающую оценку, текущий pilot profile index, approved-library interpretation и PDF-отчёт для самоанализа и разговора о рабочих условиях." },
      { title: "Статус доказательности", body: "Item bank имеет статус draft for pilot. Нормативные популяционные claims, клиническая валидность, оценка IQ, прогнозирование профессии/успеха и пригодность для найма не заявляются." },
      { title: "Оплата и доступ", body: "Доступ к одной версии оценки предоставляется после подтверждённого signed payment event. Цена, валюта, test ID и checkout session фиксируются в order; entitlement создаётся только после серверной проверки этих значений." },
      { title: "Допустимое использование", body: "Пользователь не должен обходить authentication, подменять ответы, отправлять чужие идентификаторы, извлекать item bank вне предусмотренного интерфейса или использовать результат для медицинских, кадровых, кредитных и других высокозначимых решений." },
      { title: "Согласия", body: "Terms и Privacy/processing обязательны до начала сессии. Research и marketing — отдельные необязательные решения; покупка не означает их предоставление." },
      { title: "Интеллектуальные права", body: "Названия, вопросы, код, дизайн и отчётные материалы принадлежат оператору или используются на соответствующем основании. Запрещается перепубликовывать item bank и тексты без разрешения." },
      { title: "Доступность и изменения", body: "Сервис может временно быть недоступен для обновления, безопасности или исправления ошибок. Версии assessment/scoring/report фиксируются, чтобы уже созданный отчёт не менялся при обновлении будущей версии." },
      { title: "Ограничение результата", body: "Результат является материалом для рефлексии. Пользователь самостоятельно проверяет его наблюдениями и обратной связью; сервис не принимает решения за пользователя и не гарантирует исход." },
      { title: "Возвраты и претензии", body: `ТРЕБУЕТСЯ УТВЕРЖДЕНИЕ: порядок возвратов, налоговые документы, канал претензий и сроки ответа должны быть настроены оператором до платного запуска. Контакт: ${config.supportContact}.` },
      { title: "Применимое право", body: config.jurisdiction },
    ],
  };
}
