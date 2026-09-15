import { PDFDocument, PageSizes, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fontData from "@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf?inline";

import type { ReportJSON, ScoreProfile } from "@/lib/assessment-engine";

const ink = rgb(0.06, 0.1, 0.19);
const muted = rgb(0.34, 0.4, 0.52);
const lime = rgb(0.85, 0.95, 0.42);
const cyan = rgb(0.46, 0.86, 0.84);
const coral = rgb(1, 0.45, 0.37);
const paper = rgb(0.96, 0.97, 0.95);
const white = rgb(1, 1, 1);

type PdfSection = { label: string; body: string };
type PdfPageSpec = { kicker: string; title: string; lead?: string; sections?: PdfSection[] };

function decodeDataUrl(value: string) {
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function fontBytes() {
  if (fontData.startsWith("data:")) return decodeDataUrl(fontData);
  const response = await fetch(fontData);
  if (!response.ok) throw new Error("PDF_FONT_UNAVAILABLE");
  return new Uint8Array(await response.arrayBuffer());
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawWrapped(
  page: PDFPage,
  text: string,
  font: PDFFont,
  x: number,
  y: number,
  width: number,
  size: number,
  color = ink,
  lineHeight = size * 1.45,
) {
  let cursor = y;
  for (const line of wrapText(text, font, size, width)) {
    page.drawText(line, { x, y: cursor, size, font, color });
    cursor -= lineHeight;
  }
  return cursor;
}

function addHeader(page: PDFPage, font: PDFFont, kicker: string, title: string, lead: string | undefined, pageNumber: number) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: paper });
  page.drawRectangle({ x: 0, y: height - 12, width, height: 12, color: ink });
  page.drawText("ORBITA—30", { x: 46, y: height - 52, size: 10, font, color: ink });
  page.drawText(kicker.toUpperCase(), { x: 46, y: height - 90, size: 9, font, color: coral });
  page.drawText(title, { x: 46, y: height - 139, size: 29, font, color: ink });
  let cursor = height - 174;
  if (lead) cursor = drawWrapped(page, lead, font, 46, cursor, width - 92, 13, muted, 19) - 14;
  page.drawLine({ start: { x: 46, y: 48 }, end: { x: width - 46, y: 48 }, thickness: 0.7, color: rgb(0.82, 0.85, 0.87) });
  page.drawText("Развивающий профиль · не диагностика · не прогноз", { x: 46, y: 29, size: 8, font, color: muted });
  page.drawText(`${String(pageNumber).padStart(2, "0")} / 24`, { x: width - 92, y: 29, size: 8, font, color: muted });
  return cursor;
}

function drawSections(page: PDFPage, font: PDFFont, sections: PdfSection[] | undefined, startY: number) {
  const { width } = page.getSize();
  let cursor = startY;
  for (const section of sections ?? []) {
    page.drawText(section.label.toUpperCase(), { x: 46, y: cursor, size: 9, font, color: coral });
    cursor -= 19;
    cursor = drawWrapped(page, section.body, font, 46, cursor, width - 92, 12, ink, 18) - 24;
  }
}

function coverPage(pdf: PDFDocument, font: PDFFont, profile: ScoreProfile, report: ReportJSON) {
  const page = pdf.addPage(PageSizes.A4);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: ink });
  page.drawCircle({ x: width - 90, y: height - 110, size: 170, color: lime, opacity: 0.92 });
  page.drawCircle({ x: width - 90, y: height - 110, size: 122, color: ink, opacity: 1 });
  page.drawCircle({ x: width - 90, y: height - 110, size: 64, color: cyan, opacity: 0.8 });
  page.drawText("ORBITA—30", { x: 52, y: height - 78, size: 13, font, color: lime });
  page.drawText("Карта способа", { x: 52, y: height - 240, size: 39, font, color: white });
  page.drawText("действовать.", { x: 52, y: height - 288, size: 39, font, color: lime });
  drawWrapped(page, report.executiveSummary, font, 52, height - 346, width - 104, 15, rgb(0.83, 0.87, 0.91), 23);
  drawWrapped(
    page,
    `Top 5 · ${profile.traits.slice(0, 5).map((trait) => trait.name).join(" · ")}`,
    font,
    52,
    116,
    width - 104,
    10,
    cyan,
    14,
  );
  page.drawText("ПЕРСОНАЛЬНЫЙ РАЗВИВАЮЩИЙ ОТЧЁТ", { x: 52, y: 79, size: 9, font, color: rgb(0.65, 0.7, 0.76) });
  page.drawText("01 / 24", { x: width - 92, y: 29, size: 8, font, color: rgb(0.65, 0.7, 0.76) });
}

function pageFromSpec(pdf: PDFDocument, font: PDFFont, spec: PdfPageSpec, pageNumber: number) {
  const page = pdf.addPage(PageSizes.A4);
  const cursor = addHeader(page, font, spec.kicker, spec.title, spec.lead, pageNumber);
  drawSections(page, font, spec.sections, cursor);
}

function profilePage(pdf: PDFDocument, font: PDFFont, traits: ScoreProfile["traits"], pageNumber: number) {
  const page = pdf.addPage(PageSizes.A4);
  const cursor = addHeader(page, font, "Полный профиль", "30 шкал в одном поле", "Числа показывают текущий срез. Интервал — диапазон, в котором может находиться оценка при повторном измерении.", pageNumber);
  let y = cursor;
  for (const [index, trait] of traits.entries()) {
    page.drawText(String(trait.rank).padStart(2, "0"), { x: 46, y, size: 12, font, color: coral });
    page.drawText(trait.name, { x: 84, y, size: 12, font, color: ink });
    page.drawText(`${trait.standardScore}`, { x: 360, y, size: 12, font, color: ink });
    page.drawText(`индекс ${trait.profileIndex}`, { x: 403, y, size: 9, font, color: muted });
    page.drawText(`${trait.uncertaintyRange[0]}—${trait.uncertaintyRange[1]}`, { x: 477, y, size: 9, font, color: muted });
    page.drawLine({ start: { x: 84, y: y - 8 }, end: { x: 540, y: y - 8 }, thickness: 0.5, color: rgb(0.83, 0.85, 0.87) });
    y -= 34;
    if (index >= 8) break;
  }
}

export async function buildReportPdf(profile: ScoreProfile, report: ReportJSON) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  pdf.setProducer("ORBITA-30 deterministic report generator");
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await fontBytes(), { subset: true });
  coverPage(pdf, font, profile, report);

  pageFromSpec(pdf, font, {
    kicker: "Как читать",
    title: "Сначала смысл, потом число.",
    lead: "ORBITA—30 описывает предпочтительные режимы действия. Это не ярлык и не рейтинг ценности человека.",
    sections: [
      { label: "Диапазон", body: "Более высокий показатель означает, что такой режим чаще может быть доступен без большого сознательного усилия. Более низкий — что он может требовать поддержки, практики или другого распределения ролей." },
      { label: "Уверенность", body: report.confidenceNote },
      { label: "Граница применения", body: "Результат подходит для самоанализа, разговора о взаимодействии и планирования развития. Он не предназначен для медицинских, кадровых, кредитных или иных высокозначимых решений." },
    ],
  }, 2);
  pageFromSpec(pdf, font, {
    kicker: "Краткий сигнал",
    title: "Ваш текущий рисунок.",
    lead: report.executiveSummary,
    sections: [
      { label: "Top 5", body: profile.traits.slice(0, 5).map((trait) => `${trait.name} — ${trait.standardScore}`).join("\n") },
      { label: "Качество ответа", body: `RQI ${Math.round(profile.responseQuality.rqi * 100)}%. ${profile.responseQuality.flags.length ? `Внутренние флаги: ${profile.responseQuality.flags.join(", ")}.` : "Значимых внутренних флагов качества не обнаружено."}` },
      { label: "Домены", body: profile.domains.map((domain) => `${domain.name} — ${domain.score}`).join("\n") },
    ],
  }, 3);

  let pageNumber = 4;
  for (const strength of report.topStrengths.slice(0, 5)) {
    const trait = profile.traits.find((candidate) => candidate.code === strength.trait);
    pageFromSpec(pdf, font, {
      kicker: `Top ${trait?.rank ?? pageNumber - 3}`,
      title: trait?.name ?? strength.trait,
      lead: strength.contribution,
      sections: [
        { label: "Как это может проявляться", body: strength.manifestations.join("\n") },
        { label: "Условия", body: strength.bestConditions.join("\n") },
        { label: "Числовой контекст", body: trait ? `Standard score ${trait.standardScore}; пилотный индекс профиля ${trait.profileIndex}; диапазон неопределённости ${trait.uncertaintyRange[0]}—${trait.uncertaintyRange[1]}.` : "Числовой контекст недоступен." },
      ],
    }, pageNumber);
    pageNumber += 1;
    pageFromSpec(pdf, font, {
      kicker: "Практика",
      title: `Использовать ${trait?.name ?? "эту силу"} бережно.`,
      lead: strength.overuseRisk,
      sections: [
        { label: "Риск overuse", body: strength.overuseRisk },
        { label: "Два наблюдаемых шага", body: strength.developmentActions.join("\n") },
        { label: "Вопрос к себе", body: `В какой ситуации ${trait?.name ?? "этот режим"} уже помог, а в какой его стало слишком много?` },
      ],
    }, pageNumber);
    pageNumber += 1;
  }

  pageFromSpec(pdf, font, { kicker: "Сочетания", title: "Силы работают не по одной.", lead: "Сочетания помогают перейти от списка к наблюдаемым ситуациям.", sections: report.combinations.map((item) => ({ label: item.title, body: item.text })) }, 14);
  pageFromSpec(pdf, font, { kicker: "Команда", title: "Что вы даёте и что полезно получать.", sections: [{ label: "Ваш вклад", body: report.teamwork.gives }, { label: "Полезная поддержка", body: report.teamwork.needs }, { label: "Совместная работа", body: report.collaborationStyle }, { label: "Коммуникация", body: report.communicationStyle }] }, 15);
  pageFromSpec(pdf, font, { kicker: "Решения", title: "Ваш способ двигаться к выбору.", lead: report.decisionStyle, sections: [{ label: "Мышление", body: report.thinkingStyle }, { label: "Выполнение", body: report.executionStyle }, { label: "Влияние", body: report.influenceStyle }, { label: "Проверка", body: "Перед решением отделите наблюдаемые факты от предположений и заранее назовите сигнал, который заставит пересмотреть выбор." }] }, 16);
  pageFromSpec(pdf, font, { kicker: "Условия", title: "Где рисунок может раскрываться.", sections: [{ label: "Рабочие среды", body: report.workEnvironments.join("\n") }, { label: "Самоуправление", body: report.selfManagementStyle }, { label: "Стресс и слепые зоны", body: report.stressAndBlindSpots }, { label: "Принцип", body: "Среда не обязана совпадать с профилем целиком. Важнее, чтобы были понятны условия, в которых сильные режимы доступны, и способы компенсации остальных." }] }, 17);
  pageFromSpec(pdf, font, { kicker: "30 дней", title: "План одного наблюдаемого месяца.", lead: "Выберите шаги, которые можно увидеть в календаре или в разговоре, а не только почувствовать.", sections: report.development30Days.map((action, index) => ({ label: `Шаг ${index + 1}`, body: action })) }, 18);
  profilePage(pdf, font, profile.traits.slice(0, 8), 19);
  profilePage(pdf, font, profile.traits.slice(8, 16), 20);
  profilePage(pdf, font, profile.traits.slice(16, 24), 21);
  profilePage(pdf, font, profile.traits.slice(24, 30), 22);
  pageFromSpec(pdf, font, { kicker: "Методология", title: "Что находится под результатом.", sections: [{ label: "Конструкт", body: "30 оригинальных шкал объединены в 6 доменов. Формат сочетает forced-choice, Likert и адаптивные уточнения." }, { label: "Scoring", body: "Числа рассчитываются детерминированным engine. Интерпретационный слой не может изменить score JSON, rank, пилотный индекс профиля или диапазоны неопределённости." }, { label: "Статус норм", body: `normStatus: ${profile.normStatus}; нормативная выборка и валидированные популяционные нормы не заявляются.` }, { label: "Качество", body: `RQI ${Math.round(profile.responseQuality.rqi * 100)}%. Флаги качества показываются как повод для осторожного чтения, а не как автоматическое обнуление результата.` }] }, 23);
  pageFromSpec(pdf, font, { kicker: "Границы", title: "Этот отчёт не решает за вас.", lead: "ORBITA—30 — развивающий инструмент собственного проекта, не лицензированная реализация Gallup/CliftonStrengths и не научное заключение.", sections: [{ label: "Нельзя использовать", body: "Для диагностики, оценки здоровья или интеллекта, автоматического найма/увольнения, кредита, страхования, допуска к образованию или другого решения, где цена ошибки высока." }, { label: "Можно использовать", body: "Для рефлексии, подготовки к разговору, распределения ролей и небольших экспериментов развития." }, { label: "Следующий шаг", body: "Сверьте выводы с собственными наблюдениями и обратной связью людей, которым вы доверяете. Если они расходятся, это повод исследовать контекст, а не выбрать «правильную» версию себя." }] }, 24);

  return pdf.save({ useObjectStreams: true });
}
