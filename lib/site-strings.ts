/**
 * Словари сайта RU/KK. KK — DRAFT-UNREVIEWED (см. lib/i18n.ts: back-translation
 * и когнитивные интервью ещё не пройдены). Хук языка: lib/site-lang.tsx.
 */
import type { SiteLang } from "@/lib/site-lang";

export type Dict<T> = Record<SiteLang, T>;

export const COOKIE_STRINGS: Dict<{
  aria: string; title: string; body: string; more: string;
  necessary: string; allow: string;
  prefTitle: string; prefBody: string; statusOn: string; statusOff: string; statusNone: string; statusPrefix: string;
}> = {
  ru: {
    aria: "Настройки файлов cookie",
    title: "Файлы cookie",
    body: "T-Skills использует необходимые cookies для входа и защиты запросов. Необязательная first-party аналитика отправляет только ограниченные события после отдельного выбора; сторонние рекламные трекеры не подключены.",
    more: "Подробнее о cookies",
    necessary: "Только необходимые",
    allow: "Разрешить аналитику",
    prefTitle: "Настройки cookies",
    prefBody: "Выбор хранится только на этом устройстве. Сторонние cookies и рекламная аналитика не подключены. При разрешении first-party аналитики отправляются ограниченные события продукта без сырых ответов.",
    statusOn: "аналитика разрешена",
    statusOff: "только необходимые",
    statusNone: "Выбор ещё не сделан.",
    statusPrefix: "Текущий выбор",
  },
  kk: {
    aria: "Cookie файлдарының баптаулары",
    title: "Cookie файлдары",
    body: "T-Skills кіру мен сұраныстарды қорғау үшін қажетті cookie-лерді қолданады. Қосымша first-party талдау жеке таңдаудан кейін ғана шектеулі оқиғалар жібереді; үшінші тарап жарнама трекерлері қосылмаған.",
    more: "Cookie туралы толығырақ",
    necessary: "Тек қажеттісі",
    allow: "Талдауға рұқсат",
    prefTitle: "Cookie баптаулары",
    prefBody: "Таңдау тек осы құрылғыда сақталады. Үшінші тарап cookie-лері мен жарнама талдауы қосылмаған. First-party талдауға рұқсат берілсе, шикі жауаптарсыз шектеулі өнім оқиғалары жіберіледі.",
    statusOn: "талдауға рұқсат",
    statusOff: "тек қажеттісі",
    statusNone: "Таңдау әлі жасалмаған.",
    statusPrefix: "Ағымдағы таңдау",
  },
};

export const AUTH_STRINGS: Dict<{
  skip: string; brand: string; eyebrow: string;
  headingLogin: string; headingRegister: string; headingVerify: string; headingResetRequest: string; headingReset: string;
  subRegister: string; subResetRequest: string; subReset: string; subLogin: string;
  password: string; show: string; hide: string; min12: string; repeat: string; mismatch: string;
  invite: string; inviteHelp: string; consents: string; termsRow: string; termsLink: string;
  privacyRow: string; privacyLink: string;
  verifyFail: string; requestFail: string; sendFail: string; emailFail: string; termsError: string;
  checking: string; login: string; create: string; sendLink: string; savePassword: string;
  checkingLink: string; invalidLink: string;
  forgot: string; backToLogin: string; createAccount: string; resend: string;
  legalPre: string; legalTerms: string; legalMid: string; legalPrivacy: string; legalPost: string;
}> = {
  ru: {
    skip: "Перейти к форме",
    brand: "T-Skills, на главную",
    eyebrow: "Личный кабинет",
    headingLogin: "С возвращением",
    headingRegister: "Создайте аккаунт",
    headingVerify: "Подтверждаем e-mail",
    headingResetRequest: "Восстановите доступ",
    headingReset: "Создайте новый пароль",
    subRegister: "Сначала подтвердите e-mail. Это защищает доступ к вашему профилю и отчётам.",
    subResetRequest: "Мы отправим ссылку на адрес, связанный с аккаунтом.",
    subReset: "Ссылка действует ограниченное время и используется один раз.",
    subLogin: "Войдите, чтобы продолжить оценку или открыть свои результаты.",
    password: "Пароль",
    show: "Показать",
    hide: "Скрыть",
    min12: "Минимум 12 символов.",
    repeat: "Повторите пароль",
    mismatch: "Пароли не совпадают.",
    invite: "Код приглашения (если есть)",
    inviteHelp: "Необязательно. Если есть персональный код — введите его.",
    consents: "Согласия для аккаунта",
    termsRow: "Я принимаю",
    termsLink: "условия использования",
    privacyRow: "Я ознакомился(ась) с",
    privacyLink: "политикой конфиденциальности",
    verifyFail: "Не удалось подтвердить e-mail.",
    requestFail: "Не удалось выполнить запрос.",
    sendFail: "Не удалось отправить письмо.",
    emailFail: "Не удалось подтвердить e-mail.",
    termsError: "Чтобы создать аккаунт, примите условия использования и подтвердите ознакомление с политикой конфиденциальности.",
    checking: "Проверяем…",
    login: "Войти",
    create: "Создать аккаунт",
    sendLink: "Отправить ссылку",
    savePassword: "Сохранить новый пароль",
    checkingLink: "Проверяем ссылку…",
    invalidLink: "Ссылка недействительна. Запросите новое письмо.",
    forgot: "Забыли пароль?",
    backToLogin: "Вернуться ко входу",
    createAccount: "Создать аккаунт",
    resend: "Отправить письмо ещё раз",
    legalPre: "Для создания аккаунта потребуется принять",
    legalTerms: "условия использования",
    legalMid: "и подтвердить ознакомление с",
    legalPrivacy: "политикой конфиденциальности",
    legalPost: ".",
  },
  kk: {
    skip: "Формаға өту",
    brand: "T-Skills, басты бетке",
    eyebrow: "Жеке кабинет",
    headingLogin: "Қайта оралуыңызбен",
    headingRegister: "Аккаунт жасаңыз",
    headingVerify: "E-mail растауда",
    headingResetRequest: "Қолжетімділікті қалпына келтіріңіз",
    headingReset: "Жаңа құпиясөз жасаңыз",
    subRegister: "Алдымен e-mail растаңыз. Бұл бейініңіз бен есептеріңізге қолжетімділікті қорғайды.",
    subResetRequest: "Аккаунтқа байланысты мекенжайға сілтеме жібереміз.",
    subReset: "Сілтеме шектеулі уақыт әрекет етеді және бір рет қолданылады.",
    subLogin: "Бағалауды жалғастыру немесе нәтижелеріңізді ашу үшін кіріңіз.",
    password: "Құпиясөз",
    show: "Көрсету",
    hide: "Жасыру",
    min12: "Кемі 12 таңба.",
    repeat: "Құпиясөзді қайталаңыз",
    mismatch: "Құпиясөздер сәйкес емес.",
    invite: "Шақыру коды (бар болса)",
    inviteHelp: "Міндетті емес. Жеке кодыңыз болса — енгізіңіз.",
    consents: "Аккаунтқа келісімдер",
    termsRow: "Мен қабылдаймын",
    termsLink: "пайдалану шарттарын",
    privacyRow: "Мен таныстым",
    privacyLink: "құпиялылық саясатымен",
    verifyFail: "E-mail расталмады.",
    requestFail: "Сұраныс орындалмады.",
    sendFail: "Хат жіберілмеді.",
    emailFail: "E-mail расталмады.",
    termsError: "Аккаунт жасау үшін пайдалану шарттарын қабылдап, құпиялылық саясатымен танысқаныңызды растаңыз.",
    checking: "Тексерудеміз…",
    login: "Кіру",
    create: "Аккаунт жасау",
    sendLink: "Сілтеме жіберу",
    savePassword: "Жаңа құпиясөзді сақтау",
    checkingLink: "Сілтеме тексерілуде…",
    invalidLink: "Сілтеме жарамсыз. Жаңа хат сұраңыз.",
    forgot: "Құпиясөзді ұмыттыңыз ба?",
    backToLogin: "Кіруге оралу",
    createAccount: "Аккаунт жасау",
    resend: "Хатты қайта жіберу",
    legalPre: "Аккаунт жасау үшін қабылдау қажет",
    legalTerms: "пайдалану шарттарын",
    legalMid: "және танысқаныңызды растау",
    legalPrivacy: "құпиялылық саясатымен",
    legalPost: ".",
  },
};

export const CATALOG_STRINGS: Dict<{
  eyebrow: string; title: string; body: string; mainTest: string; profile: string;
  statTraits: string; statQuestions: string; time: string; report: string; format: string;
  open: string; note1t: string; note1b: string; note2t: string; note2b: string; note3t: string; note3b: string;
}> = {
  ru: {
    eyebrow: "КАТАЛОГ", title: "Один тест. Рабочая карта.",
    body: "Выберите оценку, которая может стать поводом заметить устойчивые способы действовать — в работе и повседневных ситуациях.",
    mainTest: "Основной тест", profile: "Профиль ваших сильных сторон",
    statTraits: "качеств<br />в профиле", statQuestions: "основных<br />и AI-вопросов",
    time: "25–40 минут с паузами", report: "интерактивный отчёт + PDF", format: "развивающий формат",
    open: "Открыть тест",
    note1t: "Сейчас доступна одна версия",
    note1b: "Она помечена как draft for pilot. Психометрическая валидация и нормы публикуются отдельными версиями.",
    note2t: "Цена фиксируется в заказе",
    note2b: "Изменение цены теста не изменит уже созданный order или entitlement.",
    note3t: "Доступ — одноразовый",
    note3b: "Каждый entitlement привязан к одному assessment, к одной версии и к одному пользователю.",
  },
  kk: {
    eyebrow: "КАТАЛОГ", title: "Бір тест. Жұмыс картасы.",
    body: "Жұмыста және күнделікті жағдайларда тұрақты әрекет тәсілдерін байқауға себеп болар бағалауды таңдаңыз.",
    mainTest: "Негізгі тест", profile: "Мықты жақтарыңыздың бейіні",
    statTraits: "қасиет<br />бейінде", statQuestions: "негізгі<br />және AI-сұрақ",
    time: "Үзіліспен 25–40 минут", report: "интерактивті есеп + PDF", format: "дамытушы формат",
    open: "Тестті ашу",
    note1t: "Қазір бір нұсқа қолжетімді",
    note1b: "Ол draft for pilot деп белгіленген. Психометриялық валидация мен нормалар жеке нұсқалармен жарияланады.",
    note2t: "Баға тапсырыста бекітіледі",
    note2b: "Тест бағасының өзгеруі жасалған order немесе entitlement-ті өзгертпейді.",
    note3t: "Қолжетімділік — бір реттік",
    note3b: "Әр entitlement бір assessment-ке, бір нұсқаға және бір пайдаланушыға байланысты.",
  },
};

export const CONSENT_STRINGS: Dict<{
  back: string; eyebrow: string; title: string; body: string; cardTitle: string; version: string;
  terms: string; termsD: string; privacy: string; privacyD: string; research: string; researchD: string;
  marketing: string; marketingD: string; required: string; optional: string; begin: string;
  needBoth: string; sideTitle: string; sideBody: string; openPrivacy: string;
}> = {
  ru: {
    back: "← Вернуться", eyebrow: "Перед началом", title: "Сначала — правила игры.",
    body: "Прочитайте, как используется оценка, и выберите отдельные согласия. Исследовательское и маркетинговое согласие не нужны для покупки.",
    cardTitle: "Согласия", version: "Версия текста: privacy-2026-09",
    terms: "Условия использования", termsD: "Я принимаю Terms и понимаю ограничения развивающего продукта.",
    privacy: "Обработка данных", privacyD: "Я принимаю Privacy и минимизацию response data.",
    research: "Research opt-in", researchD: "Разрешить использовать обезличенные данные для пилота.",
    marketing: "Новости продукта", marketingD: "Получать редкие обновления о новых версиях и исследованиях.",
    required: "обязательно", optional: "необязательно", begin: "Открыть первый блок",
    needBoth: "Отметьте два обязательных согласия, чтобы продолжить.",
    sideTitle: "Ваш профиль строится из ответов, а не из догадок.",
    sideBody: "Имена, контакты и payment refs не передаются adaptive/report engine. После завершения доступен запрос на экспорт или удаление.",
    openPrivacy: "Открыть Privacy",
  },
  kk: {
    back: "← Қайту", eyebrow: "Бастамас бұрын", title: "Алдымен — ойын ережесі.",
    body: "Бағалаудың қалай қолданылатынын оқып, жеке келісімдерді таңдаңыз. Зерттеу және маркетинг келісімдері сатып алуға қажет емес.",
    cardTitle: "Келісімдер", version: "Мәтін нұсқасы: privacy-2026-09",
    terms: "Пайдалану шарттары", termsD: "Terms-ті қабылдаймын және дамытушы өнімнің шектеулерін түсінемін.",
    privacy: "Деректерді өңдеу", privacyD: "Privacy-ді және response data минимизациясын қабылдаймын.",
    research: "Research opt-in", researchD: "Пилотқа обезличенные деректерді қолдануға рұқсат.",
    marketing: "Өнім жаңалықтары", marketingD: "Жаңа нұсқалар мен зерттеулер туралы сирек жаңартулар алу.",
    required: "міндетті", optional: "міндетті емес", begin: "Бірінші блокты ашу",
    needBoth: "Жалғастыру үшін екі міндетті келісімді белгілеңіз.",
    sideTitle: "Бейініңіз жауаптардан құралады, жорамалдан емес.",
    sideBody: "Аттар, байланыстар және payment refs adaptive/report engine-ге берілмейді. Аяқталған соң экспорт немесе жою сұрауы қолжетімді.",
    openPrivacy: "Privacy ашу",
  },
};

export const DETAIL_STRINGS: Dict<{
  back: string; eyebrow: string; h1: string; lead: string; checkout: string; demo: string;
  featE: string; featT: string; features: [string, string, string][];
  domE: string; domT: string; domains: [string, string, string][];
  forWhom: string; forWhomT: string; forWhomB: string; format: string;
  checks: [string, string, string, string];
  getE: string; getT: string; getB: string;
}> = {
  ru: {
    back: "← Каталог тестов", eyebrow: "Тест сильных сторон", h1: "Тест T-Skills",
    lead: "Профиль предпочтительного способа действовать: как вы понимаете сложность, создаёте варианты, доводите работу, влияете и восстанавливаетесь.",
    checkout: "Перейти к оформлению", demo: "Посмотреть результат на демо-данных",
    featE: "Что внутри", featT: "Структура оценки",
    features: [
      ["01", "6 доменов", "Осмысление, создание, исполнение, влияние, связи и самоуправление."],
      ["02", "67 + 8", "Фиксированный профиль 25 качеств и короткое карьерное уточнение по вариантам A/B/C/D."],
      ["03", "Top 5 и профиль 25", "Сначала рейтинг качеств, затем карьерный shortlist и рекомендации после уточняющих ситуаций."],
      ["04", "Отчёт на языке фактов", "Без диагнозов и карьерных предсказаний; числа берутся из score JSON."],
    ],
    domE: "Домены", domT: "Шесть зон действия",
    domains: [
      ["D1", "Осмысление и анализ", "Как человек понимает сложность, данные и закономерности."],
      ["D2", "Создание и адаптация", "Как человек генерирует варианты и действует в неопределённости."],
      ["D3", "Исполнение и качество", "Как человек превращает намерения в устойчивый результат."],
      ["D4", "Влияние и движение", "Как человек инициирует, убеждает и мобилизует других."],
      ["D5", "Связи и сотрудничество", "Как человек понимает людей и строит продуктивные отношения."],
      ["D6", "Самоуправление и устойчивость", "Как человек регулирует себя и держит внутренний курс."],
    ],
    forWhom: "Для кого", forWhomT: "Для себя, команды и следующего разговора.",
    forWhomB: "Результат можно использовать как материал для развития — не как автоматическое решение о человеке.",
    format: "Формат",
    checks: ["один вопрос на экран", "пауза между блоками", "autosave и resume", "RU — везде, KZ — лендинг и teen-версия"],
    getE: "Что вы получите", getT: "Карта, а не ярлык.",
    getB: "Top 5 качеств, полный профиль из 25 качеств, карьерные направления и план развития. PDF сохраняет frozen score JSON.",
  },
  kk: {
    back: "← Тесттер каталогы", eyebrow: "Мықты жақтар тесті", h1: "T-Skills тесті",
    lead: "Әрекеттің қалаулы тәсілінің бейіні: күрделілікті қалай түсінесіз, нұсқаларды қалай жасайсыз, жұмысты қалай жеткізесіз, ықпал етіп, қалай қалпына келесіз.",
    checkout: "Рәсімдеуге өту", demo: "Демо-деректердегі нәтижені көру",
    featE: "Ішінде не бар", featT: "Бағалау құрылымы",
    features: [
      ["01", "6 домен", "Түйсіну, жасау, орындау, ықпал, байланыс және өзін-өзі басқару."],
      ["02", "67 + 8", "25 қасиеттің тіркелген бейіні және A/B/C/D нұсқалары бойынша қысқа мансаптық нақтылау."],
      ["03", "Top 5 және 25 бейін", "Алдымен қасиеттер рейтингі, сосын мансаптық shortlist және нақтылау жағдайларынан кейін ұсынымдар."],
      ["04", "Факт тіліндегі есеп", "Диагноздар мен мансап болжамдарынсыз; сандар score JSON-нан алынады."],
    ],
    domE: "Домендер", domT: "Алты әрекет аймағы",
    domains: [
      ["D1", "Түйсіну және талдау", "Адам күрделілік, деректер мен заңдылықтарды қалай түсінеді."],
      ["D2", "Жасау және бейімделу", "Адам нұсқаларды қалай жасайды және белгісіздікте қалай әрекет етеді."],
      ["D3", "Орындау және сапа", "Адам ниетті тұрақты нәтижеге қалай айналдырады."],
      ["D4", "Ықпал және қозғалыс", "Адам қалай бастама көтеріп, көндіріп, басқаларды жұмылдырады."],
      ["D5", "Байланыс және ынтымақтастық", "Адам адамдарды қалай түсініп, нәтижелі қарым-қатынас құрады."],
      ["D6", "Өзін-өзі басқару және тұрақтылық", "Адам өзін қалай реттеп, ішкі бағытты ұстайды."],
    ],
    forWhom: "Кімге", forWhomT: "Өзіңізге, командаға және келесі әңгімеге.",
    forWhomB: "Нәтижені даму материалы ретінде қолдануға болады — адам туралы автоматты шешім емес.",
    format: "Формат",
    checks: ["экранға бір сұрақ", "блоктар арасында үзіліс", "autosave және resume", "RU — барлық жерде, KZ — лендинг пен teen-нұсқа"],
    getE: "Не аласыз", getT: "Жарлық емес, карта.",
    getB: "Top 5 қасиет, 25 қасиеттің толық бейіні, мансаптық бағыттар және даму жоспары. PDF frozen score JSON сақтайды.",
  },
};

export const CHECKOUT_STRINGS: Dict<{
  back: string; eBeta: string; ePay: string; tBeta: string; tPay: string; bBeta: string; bPay: string;
  noPrice: string; lAssess: string; vAccess: string; lResult: string; vResult: string; lMode: string; lPayType: string;
  promoLabel: string; promoPlaceholder: string; promoHelp: string;
  vPilot: string; vOnce: string; tCost: string; tToPay: (c: string) => string; vFree: string;
  btnBusy: string; btnBeta: string; btnPay: string; btnOff: string;
  checking: string; paySoon: string;
  microBeta: string; microPay: string;
  g1tBeta: string; g1tPay: string; g1bBeta: string; g1bPay: string;
  g2tBeta: string; g2tPay: string; g2bBeta: string; g2bPay: string;
  g3tBeta: string; g3tPay: string; g3bBeta: string; g3bPay: string;
}> = {
  ru: {
    back: "← T-Skills", eBeta: "Закрытая beta", ePay: "Checkout",
    tBeta: "Бесплатное пилотное тестирование", tPay: "Оформление теста",
    bBeta: "Доступ предоставляется участникам закрытой beta без оплаты. Результаты не являются нормативной или диагностической оценкой.",
    bPay: "После подтверждения оплаты создаётся одноразовый доступ к конкретной версии оценки.",
    noPrice: "Цена ещё не настроена",
    lAssess: "Оценка", vAccess: "1 доступ",
    lResult: "Результат", vResult: "Dashboard + PDF",
    lMode: "Режим", lPayType: "Тип оплаты", vPilot: "пилотная версия", vOnce: "один раз",
    promoLabel: "Промокод", promoPlaceholder: "Введите промокод", promoHelp: "Если код действителен, скидка проверится на сервере перед созданием заказа.",
    tCost: "Стоимость участия", tToPay: (c) => `К оплате · ${c}`, vFree: "Бесплатно",
    btnBusy: "Создаём доступ…", btnBeta: "Начать закрытое тестирование",
    btnPay: "Перейти к защищённой оплате", btnOff: "Оплата пока недоступна",
    checking: "Проверяем доступ…",
    paySoon: "Оплата станет доступна после настройки цены и Stripe в production.",
    microBeta: "Доступ только по приглашению. Платёжные данные не требуются.",
    microPay: "Hosted checkout: карточные данные не проходят через backend T-Skills.",
    g1tBeta: "Закрытый доступ", g1tPay: "Подтверждённый webhook",
    g1bBeta: "Войти могут только приглашённые участники.", g1bPay: "Entitlement создаётся только после signed provider event.",
    g2tBeta: "Beta entitlement", g2tPay: "Идемпотентная оплата",
    g2bBeta: "Бесплатный grant хранится отдельно и не считается оплатой.", g2bPay: "Повтор одного события не создаёт второй доступ.",
    g3tBeta: "Пилотные ограничения", g3tPay: "Order snapshot",
    g3bBeta: "Профиль экспериментальный, unvalidated и не содержит percentiles.", g3bPay: "Версия теста, цена и валюта сохраняются вместе с заказом.",
  },
  kk: {
    back: "← T-Skills", eBeta: "Жабық beta", ePay: "Checkout",
    tBeta: "Тегін пилоттық тестілеу", tPay: "Тестті рәсімдеу",
    bBeta: "Қолжетімділік жабық beta қатысушыларына төлемсіз беріледі. Нәтижелер нормативтік немесе диагностикалық баға емес.",
    bPay: "Төлем расталған соң бағалаудың нақты нұсқасына бір реттік қолжетімділік жасалады.",
    noPrice: "Баға әлі бапталмаған",
    lAssess: "Бағалау", vAccess: "1 қолжетімділік",
    lResult: "Нәтиже", vResult: "Dashboard + PDF",
    lMode: "Режим", lPayType: "Төлем түрі", vPilot: "пилоттық нұсқа", vOnce: "бір рет",
    promoLabel: "Промокод", promoPlaceholder: "Промокодты енгізіңіз", promoHelp: "Код жарамды болса, жеңілдік тапсырыс жасалмас бұрын серверде тексеріледі.",
    tCost: "Қатысу құны", tToPay: (c) => `Төлеуге · ${c}`, vFree: "Тегін",
    btnBusy: "Қолжетімділік жасалуда…", btnBeta: "Жабық тестілеуді бастау",
    btnPay: "Қорғалған төлемге өту", btnOff: "Төлем әзір қолжетімсіз",
    checking: "Қолжетімділік тексерілуде…",
    paySoon: "Төлем баға мен Stripe production-да бапталған соң қолжетімді болады.",
    microBeta: "Тек шақырумен қолжетімділік. Төлем деректері қажет емес.",
    microPay: "Hosted checkout: карта деректері T-Skills backend арқылы өтпейді.",
    g1tBeta: "Жабық қолжетімділік", g1tPay: "Расталған webhook",
    g1bBeta: "Тек шақырылған қатысушылар кіре алады.", g1bPay: "Entitlement тек signed provider event-тен кейін жасалады.",
    g2tBeta: "Beta entitlement", g2tPay: "Идемпотентті төлем",
    g2bBeta: "Тегін grant бөлек сақталады және төлем саналмайды.", g2bPay: "Бір оқиғаның қайталануы екінші қолжетімділік жасамайды.",
    g3tBeta: "Пилоттық шектеулер", g3tPay: "Order snapshot",
    g3bBeta: "Бейін тәжірибелік, unvalidated және percentiles қамтымайды.", g3bPay: "Тест нұсқасы, баға және валюта тапсырыспен бірге сақталады.",
  },
};

export const METHOD_STRINGS: Dict<{
  eyebrow: string; title: string; body: string; toc: string;
  tocModel: string; tocScoring: string; tocAdaptive: string; tocQuality: string; tocValid: string; tocLimits: string;
  b1t: string; b1b: string; b2t: string; b2b: string; b3t: string; b3pre: string; b3b: string;
  b4t: string; b4b: string; b5t: string; b6t: string; b6b: string;
  formula: [string, string, string][];
  normWarn: string;
  adStatic: string; adStaticV: string; adGoal: string; adGoalV: (n: number) => string;
  adFormat: string; adFormatV: string; adScoring: string; adScoringV: string;
  quality: [string, string][];
  validation: string[];
  privacyLink: string;
  traits: [string, string][];
}> = {
  ru: {
    eyebrow: "Methodology", title: "Прозрачно — значит проверяемо.",
    body: "T-Skills отделяет конструкт, raw responses, scoring, adaptive selection и report layer. Эта версия предназначена для пилота, а не для доказанных межличностных норм.",
    toc: "Содержание", tocModel: "Модель", tocScoring: "Scoring", tocAdaptive: "Adaptive",
    tocQuality: "Quality", tocValid: "Валидация", tocLimits: "Ограничения",
    b1t: "Модель конструкта",
    b1b: "Шкалы описывают предпочтительный способ действия; низкое значение не является дефектом.",
    b2t: "Детерминированный scoring",
    b2b: "Одинаковый набор raw responses при одинаковых версиях даёт одинаковый score JSON. Mercury не имеет права менять баллы, веса, ранги или Top 5.",
    b3t: "Career adaptive",
    b3b: "уточнений A/B/C/D из approved-банка. Подбор детерминирован и зафиксирован в снапшоте; уточнения не меняют баллы качеств, только карьерный shortlist.",
    b3pre: "После 67 парных сравнений backend подбирает до",
    b4t: "Response quality",
    b4b: "Флаги качества не обнуляют результат. Они формируют RQI и при необходимости предупреждение для внутренней аналитики и отчёта.",
    b5t: "Что должно быть проверено до launch",
    b6t: "Ограничения",
    b6b: "Это не лицензированная реализация CliftonStrengths®, StrengthsFinder® или другого продукта Gallup. T-Skills использует собственную модель, названия, вопросы, scoring и визуальный язык. Вся v2 версия — pilot / unvalidated, не clinical и не hiring decision tool; перед production нужен независимый review и юридическое подтверждение.",
    formula: [
      ["Static evidence", "67 pairwise", "парные сравнения, детерминированный подсчёт"],
      ["Adaptive", "до 8 карьерных", "уточнения A/B/C/D, баллы не меняют"],
      ["Report", "frozen score JSON", "интерпретация не пересчитывает числа"],
    ],
    normWarn: "Статус normStatus: unvalidated. Пилотный индекс профиля не является долей людей и не используется для межличностного сравнения.",
    adStatic: "Static", adStaticV: "парные сравнения",
    adGoal: "Цель", adGoalV: (n) => (n >= 0 ? "карьерные уточнения" : "карьерные уточнения"),
    adFormat: "Формат", adFormatV: "один вариант",
    adScoring: "Scoring", adScoringV: "числа не меняются",
    quality: [
      ["Attention check", "Используются только проверки, совместимые с pairwise scoring."],
      ["Too fast", "Исследовательский threshold до пилотной калибровки."],
      ["Straight-lining", "Модальная частота одинаковых ответов, а не только первый ответ."],
      ["Contradiction", "Дополнительный приоритет карьерным уточнениям."],
      ["Legacy v1 markers", "Q243/Q246/Q249/Q250 сохранены только для исторических v1 snapshots и не входят в pairwise trait score."],
    ],
    validation: [
      "Экспертный review и cognitive interviews",
      "Pilot ≈500+ и item analysis",
      "EFA/CFA и reliability / SE",
      "Measurement invariance и DIF",
      "Нормы 1500–3000+ и cross-validation",
      "Visual regression PDF и accessibility e2e",
    ],
    privacyLink: "Privacy & data rights",
    traits: [],
  },
  kk: {
    eyebrow: "Methodology", title: "Ашық — тексерілерлік деген сөз.",
    body: "T-Skills конструкт, raw responses, scoring, adaptive selection және report layer-ді бөледі. Бұл нұсқа пилотқа арналған, дәлелденген тұлғааралық нормаларға емес.",
    toc: "Мазмұны", tocModel: "Модель", tocScoring: "Scoring", tocAdaptive: "Adaptive",
    tocQuality: "Quality", tocValid: "Валидация", tocLimits: "Шектеулер",
    b1t: "Конструкт моделі",
    b1b: "Шкалалар қалаулы әрекет тәсілін сипаттайды; төмен мән ақау емес.",
    b2t: "Детерминирленген scoring",
    b2b: "Бірдей нұсқаларда raw responses жинағы бірдей score JSON береді. Mercury ұпайларды, салмақтарды, рангілерді немесе Top 5-ті өзгертуге құқылы емес.",
    b3t: "Career adaptive",
    b3b: "дейін A/B/C/D нақтылаулары approved-банктан. Іріктеу детерминирленген және снапшотта тіркелген; нақтылаулар қасиет ұпайларын өзгертпейді, тек мансаптық shortlist-ті.",
    b3pre: "67 жұптық салыстырудан кейін backend",
    b4t: "Response quality",
    b4b: "Сапа жалаулары нәтижені нөлдемейді. Олар RQI қалыптастырып, қажет болса ішкі талдау мен есепке ескерту береді.",
    b5t: "Launch алдында тексерілуі тиіс",
    b6t: "Шектеулер",
    b6b: "Бұл CliftonStrengths®, StrengthsFinder® немесе басқа Gallup өнімінің лицензияланған іске асырылуы емес. T-Skills өз моделін, атауларын, сұрақтарын, scoring-ін және визуалды тілін қолданады. Бүкіл v2 нұсқасы — pilot / unvalidated, clinical емес және hiring decision tool емес; production алдында тәуелсіз review және заңды растау қажет.",
    formula: [
      ["Static evidence", "67 pairwise", "жұптық салыстырулар, детерминирленген есеп"],
      ["Adaptive", "8-ге дейін мансаптық", "A/B/C/D нақтылаулары, ұпайларды өзгертпейді"],
      ["Report", "frozen score JSON", "түсіндірме сандарды қайта есептемейді"],
    ],
    normWarn: "normStatus мәртебесі: unvalidated. Бейіннің пилоттық индексі адамдар үлесі емес және тұлғааралық салыстыруға қолданылмайды.",
    adStatic: "Static", adStaticV: "жұптық салыстырулар",
    adGoal: "Мақсат", adGoalV: (n) => (n >= 0 ? "мансаптық нақтылаулар" : "мансаптық нақтылаулар"),
    adFormat: "Формат", adFormatV: "бір нұсқа",
    adScoring: "Scoring", adScoringV: "сандар өзгермейді",
    quality: [
      ["Attention check", "Pairwise scoring-ке үйлесімді тексерулер ғана қолданылады."],
      ["Too fast", "Пилоттық калибрлеуге дейінгі зерттеу threshold-ы."],
      ["Straight-lining", "Бірдей жауаптардың модальды жиілігі, тек бірінші жауап емес."],
      ["Contradiction", "Мансаптық нақтылауларға қосымша басымдық."],
      ["Legacy v1 markers", "Q243/Q246/Q249/Q250 тек тарихи v1 snapshot-тар үшін сақталған және pairwise trait score-ға кірмейді."],
    ],
    validation: [
      "Сарапшылық review және cognitive interviews",
      "Pilot ≈500+ және item analysis",
      "EFA/CFA және reliability / SE",
      "Measurement invariance және DIF",
      "Нормалар 1500–3000+ және cross-validation",
      "Visual regression PDF және accessibility e2e",
    ],
    privacyLink: "Privacy & data rights",
    traits: [
      ["Аналитикалық", "Себептер, деректер және жағдай логикасын ашу қабілеті."],
      ["Шығармашылдық", "Жаңа идеялар, нұсқалар мен шешу жолдарын табуға бейімділік."],
      ["Коммуникация", "Ойды талқылау мен түсіндіру арқылы айқындауға бейімділік."],
      ["Эмпатия", "Басқалардың күйі мен көзқарасына назар."],
      ["Көшбасшылық", "Бағыт беруге және бірлескен әрекетті үйлестіруге дайындық."],
      ["Тәртіптілік", "Тәртіп, режим және келісілген ізділікті ұстауға бейімділік."],
      ["Бейімділік", "Шарттар немесе ақпарат өзгергенде тәсілді ауыстыруға дайындық."],
      ["Стратегиялық", "Ұзақ мерзімді бағыт пен шешім салдарына назар."],
      ["Ұсаққа мән беру", "Дәлдік, нюанстар мен ұсақ қателерді байқауға бейімділік."],
      ["Бастамашылдық", "Идеядан әрекетке бірінші көшуге дайындық."],
      ["Командашылдық", "Әрекеттерді келісіп, команда жұмысын ескеруге бейімділік."],
      ["Дербестік", "Тапсырманы орындау тәсілін өзі таңдауға дайындық."],
      ["Табандылық", "Қиындықта нәтижеге қозғалысты жалғастыру қабілеті."],
      ["Ұйымдастырушылық", "Тапсырмалар, мерзімдер мен ресурстарды реттеуге бейімділік."],
      ["Қызығушылық", "Жаңа тақырыптар, білім және кең мәнмәтінге қызығу."],
      ["Тәуекелге дайындық", "Мүмкіндік үшін белгісіздікте әрекет етуге дайындық."],
      ["Үйренгіштік", "Жаңа білім, құралдар мен жұмыс тәсілдерін меңгеруге бейімділік."],
      ["Практикалық", "Қолданыларлық, пайдалы нәтижеге бағдарлану."],
      ["Сендіру", "Дәлелдер құрып, идеяға қолдау табуға дайындық."],
      ["Жоспарлау", "Кезеңдер, мерзімдер мен ізділікті алдын ала анықтауға бейімділік."],
      ["Шешімділік", "Нұсқаны таңдап, шешімді бекітуге дайындық."],
      ["Байқағыштық", "Өзгерістер, мінез және жағдай ерекшеліктерін байқау қабілеті."],
      ["Жауапкершілік", "Уәдені орындауға және нәтиже үшін жеке жауап беруге бағдарлану."],
      ["Жүйелілік", "Бөліктер арасындағы байланыс пен үдерістің тұтас құрылымын көру қабілеті."],
      ["Күйзеліске төзімділік", "Қысымда жұмыс күйі мен қарқынды сақтау қабілеті."],
    ],
  },
};

export const INFO_STRINGS: Dict<{
  back: string; version: (v: string, u: string) => string;
  faqTitle: string; faqCta: string; supportTitle: string; supportCta: string;
  faq: [string, string][]; support: [string, string][]; supportContact: string; supportContactOff: string;
}> = {
  ru: {
    back: "← На главную",
    version: (v, u) => `Версия ${v} · обновлено ${u}`,
    faqTitle: "Вопросы, которые обычно задают.",
    faqCta: "Посмотреть тест",
    supportTitle: "Нужна помощь?",
    supportCta: "Открыть личный кабинет",
    faq: [
      ["Сколько длится тест?", "67 основных вопросов. После предварительного профиля система задаёт до 8 коротких карьерных вопросов с вариантами A/B/C/D. Между частями можно делать паузы."],
      ["Что если я закрою браузер?", "Введённый ответ сохраняется сразу, а session продолжает с последнего подтверждённого item. Уже принятые adaptive-вопросы не меняются при reload."],
      ["Почему вопросы разные?", "В тесте нет хороших и плохих сильных сторон. Mercury уточняет зоны неопределённости, а сервер проверяет каждый новый вопрос и оставляет scoring детерминированным."],
      ["Можно ли сравнивать людей?", "В MVP нет. Пилотный индекс профиля и ранг предназначены для чтения собственного среза и не являются межличностной шкалой."],
    ],
    support: [
      ["Проблема с оплатой", "Статус order проверяется по provider event. Support может повторно выдать entitlement после проверки, без повторной оплаты."],
      ["Проблема с PDF", "Отчёт можно безопасно регенерировать без пересчёта frozen score JSON."],
      ["Контакт", ""],
    ],
    supportContact: "укажите session ID, локаль и описание шага, на котором остановились.",
    supportContactOff: "Контакт поддержки ещё не настроен. Укажите session ID, локаль и описание шага только через утверждённый канал поддержки.",
  },
  kk: {
    back: "← Басты бетке",
    version: (v, u) => `${v} нұсқа · ${u} жаңартылған`,
    faqTitle: "Әдетте қойылатын сұрақтар.",
    faqCta: "Тестті көру",
    supportTitle: "Көмек керек пе?",
    supportCta: "Жеке кабинетті ашу",
    faq: [
      ["Тест қаншаға созылады?", "67 негізгі сұрақ. Алдын ала бейіннен кейін жүйе A/B/C/D нұсқалы 8-ге дейін қысқа мансаптық сұрақ қояды. Бөліктер арасында үзіліс жасауға болады."],
      ["Браузерді жауып тастасам ше?", "Енгізілген жауап бірден сақталады, ал session соңғы расталған item-нен жалғасады. Қабылданған adaptive-сұрақтар reload кезінде өзгермейді."],
      ["Сұрақтар неге әр түрлі?", "Тесте жақсы-жаман мықты жақтар жоқ. Mercury белгісіздік аймақтарын нақтылайды, ал сервер әр жаңа сұрақты тексеріп, scoring-ді детерминирленген қалдырады."],
      ["Адамдарды салыстыруға бола ма?", "MVP-де жоқ. Бейіннің пилоттық индексі мен рангі өз кесіндіңізді оқуға арналған және тұлғааралық шкала емес."],
    ],
    support: [
      ["Төлем мәселесі", "Order мәртебесі provider event бойынша тексеріледі. Support тексеруден кейін қайта төлемсіз entitlement-ті қайта бере алады."],
      ["PDF мәселесі", "Есепті frozen score JSON қайта есептеусіз қауіпсіз қайта жасауға болады."],
      ["Байланыс", ""],
    ],
    supportContact: "session ID, локаль және тоқтаған қадам сипаттамасын көрсетіңіз.",
    supportContactOff: "Қолдау байланысы әлі бапталмаған. Session ID, локаль және қадам сипаттамасын тек бекітілген қолдау арнасы арқылы көрсетіңіз.",
  },
};

export const OB_STRINGS: Dict<{
  back: string; eyebrow: string; title: string; body: string;
  age: string; edu: string; eduOpts: [string, string, string, string, string];
  subjects: string; subjectsPh: string; subjectsHelp: string;
  errAge: string; errEdu: string; saving: string; go: string;
}> = {
  ru: {
    back: "← Вернуться", eyebrow: "Короткая анкета", title: "Добавим немного контекста.",
    body: "Эти ответы не меняют рейтинг 25 качеств. Они понадобятся позже, чтобы точнее уточнить карьерные направления.",
    age: "Возраст", edu: "Класс / курс / уровень",
    eduOpts: ["Школа", "Колледж", "Университет", "Профессиональное обучение", "Другое"],
    subjects: "Любимые предметы", subjectsPh: "Например: математика, история, информатика",
    subjectsHelp: "Если предметов несколько, разделите их запятыми.",
    errAge: "Укажите возраст от 10 до 100 лет.",
    errEdu: "Заполните уровень образования и хотя бы один любимый предмет.",
    saving: "Сохраняем…", go: "Перейти к вопросам",
  },
  kk: {
    back: "← Қайту", eyebrow: "Қысқа сауалнама", title: "Біраз мәнмәтін қосайық.",
    body: "Бұл жауаптар 25 қасиет рейтингін өзгертпейді. Мансаптық бағыттарды дәлірек нақтылауға кейін қажет болады.",
    age: "Жасыңыз", edu: "Сынып / курс / деңгей",
    eduOpts: ["Мектеп", "Колледж", "Университет", "Кәсіптік оқыту", "Басқа"],
    subjects: "Сүйікті пәндер", subjectsPh: "Мысалы: математика, тарих, информатика",
    subjectsHelp: "Пәндер көп болса, үтірмен бөліңіз.",
    errAge: "10–100 жас аралығын көрсетіңіз.",
    errEdu: "Білім деңгейі мен кемі бір сүйікті пәнді толтырыңыз.",
    saving: "Сақталуда…", go: "Сұрақтарға өту",
  },
};

export const ACCOUNT_STRINGS: Dict<{
  eyebrow: string; title: string; body: string; fallbackName: string;
  localeLine: (l: string) => string;
  consents: string; consentsV: string; storage: string; storageV: string; manage: string;
  loading: string; noAccess: string; activeAccess: string;
  demoProfile: string; sessionSaved: string; betaDesc: string; paidDesc: string; getAccess: string;
  demoTop: string; top: string; prelimTop: string; openDemo: string;
  openResult: string; continueAs: string; startAs: string; getAccessFirst: string;
  loadingData: string; doneOpen: string; readyContinue: string;
  betaStart: string; paidStart: string; emptyHint: string;
  start: string; openCatalog: string; seeTests: string;
  orders: string; ordersD: string; noOrders: string; sessions: string; sessionsD: string; noSessions: string;
  answers: (n: number) => string; report: string; del: string; delAria: string;
  staticPart: string; scoringV: string; dataRights: string; dataRightsV: string;
  adV5: string; adV4: string; adLegacy: string;
  export: string; logout: string; deleteAcc: string;
}> = {
  ru: {
    eyebrow: "Личный кабинет", title: "Ваши сессии и результаты.",
    body: "Здесь хранятся доступы, прогресс и уже готовые версии отчётов.",
    fallbackName: "Ваш профиль",
    localeLine: (l) => `${l} · данные под вашим контролем`,
    consents: "Согласия", consentsV: "управляются перед началом",
    storage: "Хранение", storageV: "экспорт и удаление доступны", manage: "Управлять данными",
    loading: "Загрузка…", noAccess: "Нет доступа", activeAccess: "Доступ активен",
    demoProfile: "Демо-профиль · не сохранён на сервере", sessionSaved: "Сессия сохранена на сервере",
    betaDesc: "Закрытая бесплатная beta · пилотная версия", paidDesc: "Оплата подтверждена · можно начать",
    getAccess: "Оформите доступ, чтобы начать",
    demoTop: "Демо Top 5", top: "Top 5", prelimTop: "Предварительный Top 5", openDemo: "Открыть демо-результат",
    openResult: "Открыть результат", continueAs: "Продолжить оценку", startAs: "Начать оценку", getAccessFirst: "Сначала оформить доступ",
    loadingData: "Загружаем ваши данные…", doneOpen: "Тест уже пройден. Откройте готовый результат.",
    readyContinue: "Сессия готова к продолжению.", betaStart: "Закрытый beta-доступ активен. Начните с обязательных согласий.",
    paidStart: "Оплата подтверждена. Создайте сессию и начните с согласий.",
    emptyHint: "Пройдите тест или откройте демо, чтобы увидеть, как выглядит результат.",
    start: "Начать оценку", openCatalog: "Открыть каталог", seeTests: "Посмотреть доступные оценки",
    orders: "Заказы", ordersD: "Цена и валюта зафиксированы в каждом order.", noOrders: "Заказов пока нет.",
    sessions: "Сессии", sessionsD: "Последнее подтверждённое состояние хранится на сервере.", noSessions: "Сессий пока нет.",
    answers: (n) => `${n} ответов`, report: "Отчёт", del: "Удалить", delAria: "Удалить оценку",
    staticPart: "Статическая часть", scoringV: "Версия scoring", dataRights: "Права данных", dataRightsV: "готовы",
    adV5: "75 fixed questions · до 7 карьерных уточнений", adV4: "парные сравнения · 8 карьерных уточнений", adLegacy: "30 primary Likert · 30 discrimination",
    export: "Запросить экспорт данных", logout: "Выйти", deleteAcc: "Удалить аккаунт",
  },
  kk: {
    eyebrow: "Жеке кабинет", title: "Сессияларыңыз бен нәтижелеріңіз.",
    body: "Мұнда қолжетімділіктер, прогресс және дайын есеп нұсқалары сақталады.",
    fallbackName: "Сіздің бейініңіз",
    localeLine: (l) => `${l} · деректер сіздің бақылауыңызда`,
    consents: "Келісімдер", consentsV: "басталар алдында басқарылады",
    storage: "Сақтау", storageV: "экспорт пен жою қолжетімді", manage: "Деректерді басқару",
    loading: "Жүктелуде…", noAccess: "Қолжетімділік жоқ", activeAccess: "Қолжетімділік белсенді",
    demoProfile: "Демо-бейін · серверде сақталмаған", sessionSaved: "Сессия серверде сақталған",
    betaDesc: "Жабық тегін beta · пилоттық нұсқа", paidDesc: "Төлем расталды · бастауға болады",
    getAccess: "Бастау үшін қолжетімділікті рәсімдеңіз",
    demoTop: "Демо Top 5", top: "Top 5", prelimTop: "Алдын ала Top 5", openDemo: "Демо-нәтижені ашу",
    openResult: "Нәтижені ашу", continueAs: "Бағалауды жалғастыру", startAs: "Бағалауды бастау", getAccessFirst: "Алдымен қолжетімділікті рәсімдеңіз",
    loadingData: "Деректеріңіз жүктелуде…", doneOpen: "Тест өтілген. Дайын нәтижені ашыңыз.",
    readyContinue: "Сессия жалғастыруға дайын.", betaStart: "Жабық beta-қолжетімділік белсенді. Міндетті келісімдерден бастаңыз.",
    paidStart: "Төлем расталды. Сессия жасап, келісімдерден бастаңыз.",
    emptyHint: "Нәтиженің қалай көрінетінін көру үшін тесттен өтіңіз немесе демо ашыңыз.",
    start: "Бағалауды бастау", openCatalog: "Каталогты ашу", seeTests: "Қолжетімді бағаларды көру",
    orders: "Тапсырыстар", ordersD: "Баға мен валюта әр order-да бекітілген.", noOrders: "Әзір тапсырыс жоқ.",
    sessions: "Сессиялар", sessionsD: "Соңғы расталған күй серверде сақталады.", noSessions: "Әзір сессия жоқ.",
    answers: (n) => `${n} жауап`, report: "Есеп", del: "Жою", delAria: "Бағалауды жою",
    staticPart: "Статикалық бөлім", scoringV: "Scoring нұсқасы", dataRights: "Дерек құқықтары", dataRightsV: "дайын",
    adV5: "75 fixed questions · 7-ге дейін мансаптық нақтылау", adV4: "жұптық салыстырулар · 8 мансаптық нақтылау", adLegacy: "30 primary Likert · 30 discrimination",
    export: "Деректер экспортын сұрау", logout: "Шығу", deleteAcc: "Аккаунтты жою",
  },
};

export const AS_STRINGS: Dict<{
  resp: [string, string, string, string, string];
  leftSt: string; rightSt: string; closerL: string; closerR: string; pairwiseAria: string;
  careerAria: string; leftStyle: string; rightStyle: string;
  oftenL: string; same: string; oftenR: string; forcedAria: string;
  likert1: string; likert4: string; likert7: string; likertAria: string; likertHint: string;
  mainPart: string; blockN: (n: number) => string; careerClar: string;
  questionOf: (n: number, m: number) => string; pause: string;
  compareSt: string; typicalBeh: string; careerCl2: string;
  whatCloser: string; whatOften: string; howUsual: string;
  instrCareer: string; instrPair: string; instrForced: string; instrLikert: string;
  answerTypical: string; softTimer: string; finishBlock: string; saveContinue: string; privacyNote: string;
}> = {
  ru: {
    resp: ["Сильно левое", "Скорее левое", "Одинаково", "Скорее правое", "Сильно правое"],
    leftSt: "Левое утверждение", rightSt: "Правое утверждение",
    closerL: "Ближе к левому", closerR: "Ближе к правому",
    pairwiseAria: "Выберите, какое утверждение вам ближе", careerAria: "Выберите один вариант",
    leftStyle: "Левый стиль", rightStyle: "Правый стиль",
    oftenL: "чаще левое", same: "одинаково", oftenR: "чаще правое",
    forcedAria: "Выберите, какое утверждение чаще про вас",
    likert1: "1 · совсем не про меня", likert4: "4 · зависит", likert7: "7 · полностью про меня",
    likertAria: "Оцените типичное поведение от 1 до 7",
    likertHint: "Выбирайте то, что чаще проявляется без внешнего принуждения.",
    mainPart: "Основная часть", blockN: (n) => `Блок ${n} из 5`, careerClar: "Карьерное уточнение",
    questionOf: (n, m) => `Вопрос ${n} из ${m}`, pause: "Пауза",
    compareSt: "Сравнение утверждений", typicalBeh: "Типичное поведение", careerCl2: "Карьерное уточнение",
    whatCloser: "Что вам ближе?", whatOften: "Что чаще описывает вас в сложной ситуации?", howUsual: "Насколько это обычно про вас?",
    instrCareer: "Выберите один вариант, который сейчас кажется вам наиболее близким.",
    instrPair: "Выберите вариант, который лучше описывает ваше обычное поведение.",
    instrForced: "Выберите сторону, которая чаще описывает вас. Если обе подходят одинаково — выберите середину.",
    instrLikert: "Оценивайте типичное поведение за последние 1–2 года, а не идеальный образ себя.",
    answerTypical: "Отвечайте скорее по типичному поведению.",
    softTimer: "Мягкий ориентир времени · без автоперехода",
    finishBlock: "Завершить блок", saveContinue: "Сохранить и продолжить",
    privacyNote: "Названия шкал и «правильность» ответа не показываются.",
  },
  kk: {
    resp: ["Сол жақтағы", "Көбінесе сол жақтағы", "Бірдей", "Көбінесе оң жақтағы", "Оң жақтағы"],
    leftSt: "Сол мәлімдеме", rightSt: "Оң мәлімдеме",
    closerL: "Солға жақынырақ", closerR: "Оңға жақынырақ",
    pairwiseAria: "Сізге қай мәлімдеме жақынырақ — соны таңдаңыз", careerAria: "Бір нұсқаны таңдаңыз",
    leftStyle: "Сол стиль", rightStyle: "Оң стиль",
    oftenL: "жиі сол", same: "бірдей", oftenR: "жиі оң",
    forcedAria: "Қай мәлімдеме сізді жиі сипаттайды — соны таңдаңыз",
    likert1: "1 · мүлде мен туралы емес", likert4: "4 · байланысты", likert7: "7 · толық мен туралы",
    likertAria: "Әдетті мінезді 1–7 бойынша бағалаңыз",
    likertHint: "Сыртқы мәжбүрлеусіз жиі көрінетінін таңдаңыз.",
    mainPart: "Негізгі бөлім", blockN: (n) => `${n}-блок / 5`, careerClar: "Мансаптық нақтылау",
    questionOf: (n, m) => `Сұрақ ${n} / ${m}`, pause: "Үзіліс",
    compareSt: "Мәлімдемелерді салыстыру", typicalBeh: "Әдетті мінез", careerCl2: "Мансаптық нақтылау",
    whatCloser: "Саған қайсысы жақынырақ?", whatOften: "Күрделі жағдайда сізді қайсысы жиі сипаттайды?", howUsual: "Бұл әдетте сіз туралы қаншалықты?",
    instrCareer: "Қазір өзіңізге ең жақын көрінген бір нұсқаны таңдаңыз.",
    instrPair: "Әдетті мінезіңізді жақсы сипаттайтын нұсқаны таңдаңыз.",
    instrForced: "Сізді жиі сипаттайтын жақты таңдаңыз. Екеуі бірдей келсе — ортасын таңдаңыз.",
    instrLikert: "Соңғы 1–2 жылдағы әдетті мінезді бағалаңыз, өзіңіздің мінсіз бейнеңізді емес.",
    answerTypical: "Әдетті мінез бойынша жауап беріңіз.",
    softTimer: "Уақыттың жұмсақ бағдары · автөтусіз",
    finishBlock: "Блокты аяқтау", saveContinue: "Сақтап, жалғастыру",
    privacyNote: "Шкала атаулары мен жауаптың «дұрыстығы» көрсетілмейді.",
  },
};

export const PROC_STRINGS: Dict<{
  title: string; body: string; open: string; retryReport: string; retryAdaptive: string; waiting: string;
  coreDone: (n: number) => string; gen: string; scoring: string; report: string; complete: string; failed: string;
}> = {
  ru: {
    title: "Собираем вашу карту.",
    body: "Баллы считает versioned engine. Report layer получает уже рассчитанные данные и не может изменить числа.",
    open: "Открыть результат", retryReport: "Повторить генерацию отчёта",
    retryAdaptive: "Повторить adaptive generation", waiting: "Статус обновляется автоматически",
    coreDone: (n) => {
      const m10 = n % 10, m100 = n % 100;
      const w = m10 === 1 && m100 !== 11 ? "основной ответ" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "основных ответа" : "основных ответов";
      return `${n} ${w} зафиксированы`;
    },
    gen: "Готовим персональные уточнения", scoring: "Детерминированный score engine",
    report: "Структурированный отчёт", complete: "Результат готов",
    failed: "Провайдер временно недоступен — доступен повтор",
  },
  kk: {
    title: "Картаңызды жинаудамыз.",
    body: "Ұпайды versioned engine санайды. Report layer дайын есептелген деректерді алады және сандарды өзгерте алмайды.",
    open: "Нәтижені ашу", retryReport: "Есеп генерациясын қайталау",
    retryAdaptive: "Adaptive generation қайталау", waiting: "Мәртебе автоматты жаңартылады",
    coreDone: (n) => `${n} негізгі жауап тіркелді`,
    gen: "Жеке нақтылаулар дайындалуда", scoring: "Детерминирленген score engine",
    report: "Құрылымды есеп", complete: "Нәтиже дайын",
    failed: "Провайдер уақытша қолжетімсіз — қайталауға болады",
  },
};

export const RES_STRINGS: Dict<{
  band: (s: number) => string;
  domain: (n: number) => string; action: (n: number) => string;
  numWords: Record<number, string>;
  eyebrow: string; h1: string; cutFrom: string;
  meta: (v: string, q: number) => string;
  print: string; account: string;
  strengthen: string; strengthenB: string; study: string; studyB: string;
  detailT: string; detailAi: string; detailLib: string;
  overuse: string; fullProfile: (n: number) => string; fullB: string; fullMeta: string;
  range: string; index: (i: number) => string;
  navB: string; aggIndex: (i: number) => string;
  planT: string; envT: string; teamT: string; gives: string; needs: string;
  discT: string; stripAria: (n: number, top: string) => string;
  stripS: string; stripSt: string;
}> = {
  ru: {
    band: (s) => (s >= 75 ? "выраженный диапазон" : s >= 55 ? "рабочий диапазон" : "менее выраженный диапазон"),
    domain: (n) => (n >= 0 ? "домен" : "домен"),
    action: (n) => {
      const m10 = n % 10, m100 = n % 100;
      return m10 === 1 && m100 !== 11 ? "наблюдаемое действие" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "наблюдаемых действия" : "наблюдаемых действий";
    },
    numWords: { 1: "Одно", 2: "Два", 3: "Три", 4: "Четыре", 5: "Пять" },
    eyebrow: "T-Skills · ваш результат", h1: "Ваши сильные стороны.", cutFrom: "Срез от",
    meta: (v, q) => ` · ${v} · версия для пилота · качество ответов ${q}%`,
    print: "Печать / сохранить PDF", account: "В личный кабинет",
    strengthen: "Укрепляйте", strengthenB: "Наиболее выраженные способы действия — опирайтесь на них в первую очередь",
    study: "Изучайте", studyB: "Остальные шкалы профиля — контекст и материал для наблюдений",
    detailT: "Разбор ведущих качеств", detailAi: "Интерпретация через защищённый report provider", detailLib: "Интерпретация из approved library",
    overuse: "Перегрузка · риск в определённых условиях",
    fullProfile: (n) => `Полный профиль ${n}`, fullB: "Контекст важнее одного места",
    fullMeta: "балл, неопределённость и пилотный индекс",
    range: "Диапазон", index: (i) => `индекс ${i}`,
    navB: "Навигация, не замена профилю шкал", aggIndex: (i) => `индекс ${i} · агрегат пяти θ`,
    planT: "Условия, команда и план", envT: "Подходящие рабочие условия", teamT: "Команда",
    gives: "Вы даёте:", needs: "Вам полезно получать:",
    discT: "Как читать диапазон неопределённости",
    stripAria: (n, top) => `Профиль из ${n} шкал, лидируют ${top}`,
    stripS: "Укрепляйте · топ-10", stripSt: "Изучайте · остальные",
  },
  kk: {
    band: (s) => (s >= 75 ? "айқын диапазон" : s >= 55 ? "жұмыс диапазоны" : "әлсіздеу диапазон"),
    domain: (n) => (n >= 0 ? "домен" : "домен"),
    action: (n) => (n >= 0 ? "бақыланерлік әрекет" : "бақыланерлік әрекет"),
    numWords: { 1: "Бір", 2: "Екі", 3: "Үш", 4: "Төрт", 5: "Бес" },
    eyebrow: "T-Skills · сіздің нәтижеңіз", h1: "Сіздің мықты жақтарыңыз.", cutFrom: "Кесінді",
    meta: (v, q) => ` · ${v} · пилотқа арналған нұсқа · жауап сапасы ${q}%`,
    print: "Басып шығару / PDF сақтау", account: "Жеке кабинетке",
    strengthen: "Нығайтыңыз", strengthenB: "Ең айқын әрекет тәсілдері — алдымен соларға сүйеніңіз",
    study: "Зерделеңіз", studyB: "Бейіннің қалған шкалалары — мәнмәтін және бақылау материалы",
    detailT: "Жетекші қасиеттерді талдау", detailAi: "Қорғалған report provider арқылы түсіндірме", detailLib: "Approved library-ден түсіндірме",
    overuse: "Шамадан тыс жүктелу · кей шарттардағы тәуекел",
    fullProfile: (n) => `Толық бейін ${n}`, fullB: "Мәнмәтін бір орыннан маңызды",
    fullMeta: "ұпай, белгісіздік және пилоттық индекс",
    range: "Диапазон", index: (i) => `индекс ${i}`,
    navB: "Шкала бейінін алмастырмайтын навигация", aggIndex: (i) => `индекс ${i} · бес θ агрегаты`,
    planT: "Шарттар, команда және жоспар", envT: "Лайықты жұмыс шарттары", teamT: "Команда",
    gives: "Сіз бересіз:", needs: "Сізге алған пайдалы:",
    discT: "Белгісіздік диапазонов қалай оқу керек",
    stripAria: (n, top) => `${n} шкаладан бейін, алда ${top}`,
    stripS: "Нығайтыңыз · топ-10", stripSt: "Зерделеңіз · қалғаны",
  },
};

export const CTRL_STRINGS: Dict<{
  ready: string; saved: string; offline: string; scoring: string; saving: string;
  errReport: string; errSession: string; errBlock: string; errReportGen: string;
  errAccess: string; errConsents: string; errOnboarding: string; errUnconfirmed: string;
  errCheckoutOff: string; errCheckout: string;
  exportReady: string; errExport: string; errDelAcc: string; loggingOut: string;
  assessDeleted: string; errDelAssess: string; creatingSession: string; sessionReady: string;
  errAccount: string;
}> = {
  ru: {
    ready: "готово", saved: "ответ сохранён", offline: "ожидает соединения",
    scoring: "считаем основной сигнал…", saving: "сохраняем…",
    errReport: "Не удалось загрузить отчёт.", errSession: "Не удалось загрузить сессию.",
    errBlock: "Не удалось завершить основной блок.", errReportGen: "Не удалось сформировать отчёт.",
    errAccess: "Сначала создайте оплаченный доступ в личном кабинете.",
    errConsents: "Не удалось сохранить согласия.", errOnboarding: "Не удалось сохранить анкету.",
    errUnconfirmed: "Ответ ещё не подтверждён сервером.",
    errCheckoutOff: "Оплата пока недоступна: цена или Stripe ещё не настроены.",
    errCheckout: "Не удалось открыть оплату.",
    exportReady: "экспорт готов", errExport: "Не удалось подготовить экспорт.",
    errDelAcc: "Не удалось удалить аккаунт.", loggingOut: "выходим…",
    assessDeleted: "оценка удалена", errDelAssess: "Не удалось удалить оценку.",
    creatingSession: "создаём сессию…", sessionReady: "сессия готова",
    errAccount: "Не удалось загрузить кабинет.",
  },
  kk: {
    ready: "дайын", saved: "жауап сақталды", offline: "байланыс күтілуде",
    scoring: "негізгі сигнал есептелуде…", saving: "сақталуда…",
    errReport: "Есеп жүктелмеді.", errSession: "Сессия жүктелмеді.",
    errBlock: "Негізгі блок аяқталмады.", errReportGen: "Есеп қалыптаспады.",
    errAccess: "Алдымен жеке кабинетте ақылы қолжетімділік жасаңыз.",
    errConsents: "Келісімдер сақталмады.", errOnboarding: "Сауалнама сақталмады.",
    errUnconfirmed: "Жауап сервермен әлі расталмаған.",
    errCheckoutOff: "Төлем әзір қолжетімсіз: баға немесе Stripe бапталмаған.",
    errCheckout: "Төлем ашылмады.",
    exportReady: "экспорт дайын", errExport: "Экспорт дайындалмады.",
    errDelAcc: "Аккаунт жойылмады.", loggingOut: "шығудамыз…",
    assessDeleted: "бағалау жойылды", errDelAssess: "Бағалау жойылмады.",
    creatingSession: "сессия жасалуда…", sessionReady: "сессия дайын",
    errAccount: "Кабинет жүктелмеді.",
  },
};

export const EMAIL_STRINGS: Dict<{
  verifySubject: string; verifyText: string; verifyAction: string;
  resetSubject: string; resetText: string; resetAction: string;
  inviteSubject: string; inviteText: string; inviteAction: string;
  genericReset: string;
}> = {
  ru: {
    verifySubject: "Подтвердите e-mail для T-Skills",
    verifyText: "Подтвердите адрес электронной почты, чтобы войти в T-Skills. Ссылка действует 24 часа.",
    verifyAction: "Подтвердить e-mail",
    resetSubject: "Сброс пароля T-Skills",
    resetText: "Мы получили запрос на сброс пароля. Если это были вы, ссылка действует 1 час.",
    resetAction: "Создать новый пароль",
    inviteSubject: "Приглашение в T-Skills",
    inviteText: "Вы получили приглашение в закрытое beta-тестирование T-Skills. Ссылка действует 7 дней.",
    inviteAction: "Создать аккаунт",
    genericReset: "Если аккаунт с таким адресом существует, мы отправили инструкции по восстановлению.",
  },
  kk: {
    verifySubject: "T-Skills үшін e-mail растаңыз",
    verifyText: "T-Skills-ке кіру үшін электрондық пошта мекенжайын растаңыз. Сілтеме 24 сағат әрекет етеді.",
    verifyAction: "E-mail растау",
    resetSubject: "T-Skills құпиясөзін қалпына келтіру",
    resetText: "Құпиясөзді қалпына келтіру сұрауын алдық. Бұл сіз болсаңыз, сілтеме 1 сағат әрекет етеді.",
    resetAction: "Жаңа құпиясөз жасау",
    inviteSubject: "T-Skills-ке шақыру",
    inviteText: "T-Skills жабық beta-тестілеуіне шақыру алдыңыз. Сілтеме 7 күн әрекет етеді.",
    inviteAction: "Аккаунт жасау",
    genericReset: "Мұндай мекенжайлы аккаунт болса, қалпына келтіру нұсқауларын жібердік.",
  },
};

export function resolveEmailLocale(value: unknown): "ru" | "kk" {
  return value === "kk" ? "kk" : "ru";
}

export const SHELL_STRINGS: Dict<{
  navAria: string; brandAria: string; test: string; methodology: string; faq: string;
  profile: string; navMain: string; openMenu: string; closeMenu: string; mobileNav: string;
  privacy: string; terms: string; contact: string;
  footNote: string; support: string; refunds: string;
}> = {
  ru: {
    navAria: "Навигация T-Skills", brandAria: "T-Skills, на главную",
    test: "Тест", methodology: "Методология", faq: "FAQ", profile: "Мой профиль", navMain: "Основная навигация",
    openMenu: "Открыть меню", closeMenu: "Закрыть меню", mobileNav: "Мобильная навигация",
    privacy: "Конфиденциальность", terms: "Условия", contact: "Контакты",
    footNote: "Развивающий профиль, не диагноз", support: "Поддержка", refunds: "Возвраты",
  },
  kk: {
    navAria: "T-Skills навигациясы", brandAria: "T-Skills, басты бетке",
    test: "Тест", methodology: "Әдістеме", faq: "FAQ", profile: "Менің бейінім", navMain: "Негізгі навигация",
    openMenu: "Мәзірді ашу", closeMenu: "Мәзірді жабу", mobileNav: "Мобильді навигация",
    privacy: "Құпиялылық", terms: "Шарттар", contact: "Байланыстар",
    footNote: "Дамытушы бейін, диагноз емес", support: "Қолдау", refunds: "Қайтарулар",
  },
};
