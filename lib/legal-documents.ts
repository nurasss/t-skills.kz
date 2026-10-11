export const PRIVACY_DOCUMENT_VERSION = "privacy-2026-09";
export const TERMS_DOCUMENT_VERSION = "terms-2026-09";
const COOKIES_DOCUMENT_VERSION = "cookies-2026-09";
const REFUNDS_DOCUMENT_VERSION = "refunds-2026-09";

export { COOKIES_DOCUMENT_VERSION, REFUNDS_DOCUMENT_VERSION };

export type LegalConfig = {
  entityName: string;
  supportContact: string;
  contactAddress: string;
  contactPhone: string;
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
  refundPolicy: string;
  cookiePolicy: string;
  reviewStatus: string;
};

export const LEGAL_REVIEW_REQUIRED_RU = "Черновик: реквизиты и юридические условия не утверждены. Не использовать как утверждённый документ.";
export const LEGAL_REVIEW_REQUIRED_KK = "Жоба: оператор деректері мен құқықтық шарттар бекітілмеген. Бекітілген құжат ретінде қолданбаңыз.";

export function localizedLegalReviewStatus(status: string, locale: "ru" | "kk") {
  if (status !== LEGAL_REVIEW_REQUIRED_RU) return status;
  return locale === "kk" ? LEGAL_REVIEW_REQUIRED_KK : LEGAL_REVIEW_REQUIRED_RU;
}

export const DEFAULT_LEGAL_CONFIG: LegalConfig = {
  entityName: "[юридическое лицо оператора не настроено]",
  supportContact: "[контакт поддержки не настроен]",
  contactAddress: "[юридический адрес не настроен]",
  contactPhone: "[телефон не настроен]",
  jurisdiction: "[применимое право и юрисдикция не утверждены]",
  processingPurposes: "[цели обработки данных должны быть указаны и утверждены оператором]",
  dataCategories: "[категории обрабатываемых данных должны быть указаны и утверждены оператором]",
  retentionSchedule: "[сроки хранения и основания удаления данных не утверждены]",
  processors: "[список фактически используемых обработчиков данных не утверждён]",
  crossBorderProcessing: "[трансграничная обработка и места хранения данных требуют проверки и утверждения]",
  userRights: "[порядок реализации прав субъекта данных требует юридического утверждения]",
  securitySummary: "[описание мер безопасности требует проверки ответственным за безопасность]",
  researchPolicy: "[условия исследовательской обработки требуют отдельного юридического утверждения]",
  marketingPolicy: "[условия маркетинговой обработки требуют отдельного юридического утверждения]",
  refundPolicy: "[условия возврата и порядок обращения не утверждены оператором]",
  cookiePolicy: "[фактически используемые cookies и аналитика требуют проверки и утверждения]",
  reviewStatus: LEGAL_REVIEW_REQUIRED_RU,
};

import { getLegalDocumentKk } from "@/lib/legal-kk";

export type LegalKind = "privacy" | "terms" | "cookies" | "refunds";
type LegalBlock = { title: string; body: string };
export type LegalDocument = { title: string; version: string; updatedAt: string; blocks: LegalBlock[] };

export function getLegalDocument(kind: LegalKind, config: LegalConfig = DEFAULT_LEGAL_CONFIG, locale: "ru" | "kk" = "ru"): LegalDocument {
  const reviewStatus = localizedLegalReviewStatus(config.reviewStatus, locale);
  if (config.reviewStatus) {
    const document = getLegalDocument(kind, { ...config, reviewStatus: "" }, locale);
    const supportConfigured = Boolean(config.supportContact.trim() && !config.supportContact.trim().startsWith("["));
    return {
      ...document,
      blocks: supportConfigured ? [{
        title: locale === "kk" ? "Байланыс ақпараты" : "Контакт поддержки",
        body: config.supportContact,
      }] : [],
    };
  }
  if (locale === "kk") return getLegalDocumentKk(kind, { ...config, reviewStatus });
  if (kind === "privacy") {
    return {
      title: "Политика конфиденциальности и обработки данных",
      version: PRIVACY_DOCUMENT_VERSION,
      updatedAt: "2026-09-15",
      blocks: [
        { title: "Оператор и контакт", body: `${config.entityName}. E-mail: ${config.supportContact}. Адрес: ${config.contactAddress}. Телефон: ${config.contactPhone}.` },
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
    title: kind === "terms" ? "Условия использования T-Skills" : kind === "cookies" ? "Политика в отношении файлов cookie" : "Правила возврата средств",
    version: kind === "terms" ? TERMS_DOCUMENT_VERSION : kind === "cookies" ? COOKIES_DOCUMENT_VERSION : REFUNDS_DOCUMENT_VERSION,
    updatedAt: "2026-09-15",
    blocks: kind === "terms" ? [
      { title: "Оператор и версия", body: `${config.entityName}. Версия условий: ${TERMS_DOCUMENT_VERSION}.` },
      { title: "Что предоставляет сервис", body: "T-Skills предоставляет интерактивную развивающую оценку, текущий profile index, approved-library interpretation и PDF-отчёт для самоанализа и разговора о рабочих условиях." },
      { title: "Внешние и AI-компоненты", body: "В отдельных конфигурациях сервис может использовать внешний провайдер для подбора дополнительных вопросов. Такой контент вспомогательный, может содержать ошибки и проходит серверную проверку; окончательный score и доступ к данным определяются сервером T-Skills. Не используйте результат для медицинских, кадровых, кредитных или иных высокозначимых решений." },
      { title: "Статус доказательности", body: "Нормативные популяционные claims, клиническая валидность, оценка IQ, прогнозирование профессии/успеха и пригодность для найма не заявляются." },
      { title: "Оплата и доступ", body: "Доступ к одной версии оценки предоставляется после подтверждённого signed payment event. Цена, валюта, test ID и checkout session фиксируются в заказе; доступ создаётся только после серверной проверки этих значений." },
      { title: "Допустимое использование", body: "Пользователь не должен обходить authentication, подменять ответы, отправлять чужие идентификаторы, извлекать item bank вне предусмотренного интерфейса или использовать результат для медицинских, кадровых, кредитных и других высокозначимых решений." },
      { title: "Согласия", body: "Terms и Privacy/processing обязательны до начала сессии. Research и marketing — отдельные необязательные решения; покупка не означает их предоставление." },
      { title: "Интеллектуальные права", body: "Названия, вопросы, код, дизайн и отчётные материалы принадлежат оператору или используются на соответствующем основании. Запрещается перепубликовывать item bank и тексты без разрешения." },
      { title: "Доступность и изменения", body: "Сервис может временно быть недоступен для обновления, безопасности или исправления ошибок. Версии assessment/scoring/report фиксируются, чтобы уже созданный отчёт не менялся при обновлении будущей версии." },
      { title: "Ограничение результата", body: "Результат является материалом для рефлексии. Пользователь самостоятельно проверяет его наблюдениями и обратной связью; сервис не принимает решения за пользователя и не гарантирует исход." },
      { title: "Возвраты и претензии", body: `${config.refundPolicy} Канал обращения: ${config.supportContact}.` },
      { title: "Применимое право", body: config.jurisdiction },
    ] : kind === "cookies" ? [
      { title: "Кто устанавливает cookies", body: `${config.entityName}. Контакт: ${config.supportContact}.` },
      { title: "Необходимые cookies", body: "Сессионная cookie нужна для входа и доступа к собственным данным. Cookie CSRF нужна для защиты изменяющих запросов. Они не используются для рекламы и не содержат пароль или ответы пользователя." },
      { title: "Необязательные cookies и аналитика", body: config.cookiePolicy },
      { title: "Локальное хранилище", body: "Временная очередь несинхронизированных ответов может храниться на устройстве для восстановления после сбоя сети. Это не authentication token и не источник истины; данные очищаются после синхронизации или через 24 часа." },
      { title: "Настройки и отзыв", body: "Согласие можно изменить через панель настроек cookies. Отказ от необязательных cookies не ограничивает доступ к сервису." },
      { title: "Изменения", body: `Версия ${COOKIES_DOCUMENT_VERSION}.` },
    ] : [
      { title: "Что можно вернуть", body: config.refundPolicy },
      { title: "Как обратиться", body: `Напишите на ${config.supportContact}, укажите e-mail аккаунта, идентификатор заказа и краткое описание ситуации. Не отправляйте полный набор ответов или пароль.` },
      { title: "Срок рассмотрения", body: "Запрос проверяется по данным заказа, статусу доступа и техническим журналам. Срок ответа и способ возврата фиксируются в утверждённой коммерческой версии документа." },
      { title: "Обязательные права", body: "Эти правила не ограничивают права потребителя, предоставленные применимым законодательством." },
      { title: "Версия и контакт", body: `Версия ${REFUNDS_DOCUMENT_VERSION}. ${config.entityName}. Адрес: ${config.contactAddress}. Телефон: ${config.contactPhone}.` },
    ],
  };
}
