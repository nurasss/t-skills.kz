import { PDFDocument, PageSizes, rgb, type PDFDocument as PDFDoc, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import robotoData from "@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf?inline";
import robotoBoldData from "@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf?inline";
// Newsreader и PT Serif сознательно НЕ используются: у первого нет кириллицы,
// второй pdf-lib сабсетит с потерей глифов. Lora покрывает кириллицу и
// корректно встраивается (проверено рендером).
import loraData from "@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf?inline";

import type { ReportJSON, ScoreProfile } from "@/lib/assessment-engine";
import { T_SKILLS_ADAPTIVE_MAX_QUESTIONS, T_SKILLS_STATIC_ITEM_COUNT } from "@/lib/t-skills/versions";

/**
 * 24-страничный отчёт в духе референса Gallup CliftonStrengths:
 * обложка, инструкция, ранжированные списки «Укрепляйте/Изучайте»,
 * детальные разборы топ-качеств с цветовыми метками доменов,
 * полный профиль, команда, план, методология, границы.
 * Своя палитра и тексты; трейд-дресс Gallup не копируется.
 */

const ink = rgb(0.102, 0.094, 0.082);
const muted = rgb(0.431, 0.396, 0.345);
const accent = rgb(0.545, 0.42, 0.239);
const paper = rgb(0.965, 0.945, 0.91);
const card = rgb(0.984, 0.969, 0.933);
const rule = rgb(0.788, 0.745, 0.651);

const DOMAIN_COLORS = [
  rgb(0.561, 0.659, 0.533),
  rgb(0.486, 0.576, 0.659),
  rgb(0.78, 0.604, 0.357),
  rgb(0.761, 0.514, 0.435),
  rgb(0.718, 0.553, 0.592),
  rgb(0.608, 0.576, 0.71),
];

const TOTAL_PAGES = 24;

type Fonts = { serif: PDFFont; sans: PDFFont; sansBold: PDFFont };

type PdfSection = { label: string; body: string };
type PdfPageSpec = { kicker: string; title: string; lead?: string; sections?: PdfSection[] };

function decodeDataUrl(value: string) {
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function fontBytes(data: string) {
  if (data.startsWith("data:")) return decodeDataUrl(data);
  const response = await fetch(data);
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

function addHeader(pdf: PDFDoc, fonts: Fonts, kicker: string, title: string, lead: string | undefined, pageNumber: number) {
  const page = pdf.addPage(PageSizes.A4);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: paper });
  page.drawText("T-SKILLS", { x: 46, y: height - 52, size: 10, font: fonts.sansBold, color: ink });
  page.drawText(kicker.toUpperCase(), { x: 46, y: height - 88, size: 9, font: fonts.sansBold, color: accent });
  let cursor = drawWrapped(page, title, fonts.serif, 46, height - 128, width - 92, 29, ink, 36) - 12;
  if (lead) cursor = drawWrapped(page, lead, fonts.sans, 46, cursor, width - 92, 12.5, muted, 19) - 14;
  page.drawLine({ start: { x: 46, y: 48 }, end: { x: width - 46, y: 48 }, thickness: 0.7, color: rule });
  page.drawText("Развивающий профиль · не диагностика · не прогноз", { x: 46, y: 29, size: 8, font: fonts.sans, color: muted });
  page.drawText(`${String(pageNumber).padStart(2, "0")} / ${TOTAL_PAGES}`, { x: width - 92, y: 29, size: 8, font: fonts.sans, color: muted });
  return { page, cursor };
}

function drawSections(page: PDFPage, fonts: Fonts, sections: PdfSection[] | undefined, startY: number) {
  const { width } = page.getSize();
  let cursor = startY;
  for (const section of sections ?? []) {
    page.drawText(section.label.toUpperCase(), { x: 46, y: cursor, size: 9, font: fonts.sansBold, color: accent });
    cursor -= 19;
    cursor = drawWrapped(page, section.body, fonts.sans, 46, cursor, width - 92, 11.5, ink, 17.5) - 24;
  }
  return cursor;
}

function drawQuote(page: PDFPage, fonts: Fonts, text: string, x: number, y: number, width: number, tint = card) {
  const lines = wrapText(text, fonts.sans, 11.5, width - 28);
  const height = lines.length * 17.5 + 24;
  const top = y + 6;
  page.drawRectangle({ x, y: top - height, width, height, color: tint });
  page.drawRectangle({ x, y: top - height, width: 3.5, height, color: accent });
  let cursor = top - 22;
  for (const line of lines) {
    page.drawText(line, { x: x + 16, y: cursor, size: 11.5, font: fonts.sans, color: ink });
    cursor -= 17.5;
  }
  return top - height - 12;
}

function domainColor(index: number) {
  return DOMAIN_COLORS[Math.floor(index / 5) % DOMAIN_COLORS.length];
}

/** Полоса профиля: 25 шкал, топ-10 насыщенно. */
function drawStrip(page: PDFPage, traits: ScoreProfile["traits"], x: number, y: number, width: number, height: number) {
  const gap = 3;
  const barWidth = (width - gap * (traits.length - 1)) / traits.length;
  traits.forEach((trait, index) => {
    const h = height * (0.35 + 0.65 * (trait.standardScore / 100));
    page.drawRectangle({
      x: x + index * (barWidth + gap),
      y: y - h,
      width: barWidth,
      height: h,
      color: domainColor(index),
      opacity: index < 10 ? 0.95 : 0.35,
    });
  });
  return y - height;
}

function drawRankedList(
  pdf: PDFDoc,
  fonts: Fonts,
  traits: ScoreProfile["traits"],
  pageNumber: number,
  kicker: string,
  title: string,
  lead: string,
) {
  const { page, cursor: afterHeader } = addHeader(pdf, fonts, kicker, title, lead, pageNumber);
  const { width } = page.getSize();
  const columnWidth = (width - 92 - 40) / 2;
  const half = Math.ceil(traits.length / 2);
  const columns = [traits.slice(0, half), traits.slice(half)];
  columns.forEach((column, columnIndex) => {
    const x = 46 + columnIndex * (columnWidth + 40);
    let y = afterHeader;
    column.forEach((trait) => {
      const color = domainColor(trait.rank - 1);
      page.drawRectangle({ x, y: y - 13, width: 5, height: 18, color });
      page.drawText(String(trait.rank).padStart(2, "0"), { x: x + 12, y, size: 11, font: fonts.sans, color: muted });
      drawWrapped(page, trait.name, fonts.sansBold, x + 44, y + 1, columnWidth - 48, 12, ink, 16);
      y -= 30;
      page.drawLine({ start: { x, y }, end: { x: x + columnWidth, y }, thickness: 0.5, color: rule });
      y -= 14;
    });
  });
}

function coverPage(pdf: PDFDoc, fonts: Fonts, profile: ScoreProfile, report: ReportJSON) {
  const page = pdf.addPage(PageSizes.A4);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: paper });
  page.drawText("T-SKILLS", { x: 52, y: height - 72, size: 13, font: fonts.sansBold, color: ink });
  page.drawText("ПЕРСОНАЛЬНЫЙ РАЗВИВАЮЩИЙ ОТЧЁТ", { x: 52, y: height - 96, size: 9, font: fonts.sans, color: muted });
  drawWrapped(page, "Ваши сильные стороны.", fonts.serif, 52, height - 210, width - 104, 40, ink, 46);
  let cursor = drawWrapped(page, report.executiveSummary, fonts.sans, 52, height - 300, width - 104, 13, muted, 20) - 26;
  cursor = drawWrapped(
    page,
    `Укрепляйте: ${profile.traits.slice(0, 10).map((trait) => trait.name).join(" · ")}`,
    fonts.sans,
    52,
    cursor,
    width - 104,
    10.5,
    ink,
    16,
  ) - 10;
  drawStrip(page, profile.traits, 52, cursor - 8, width - 104, 72);
  page.drawText("УКРЕПЛЯЙТЕ · ТОП-10", { x: 52, y: 108, size: 8, font: fonts.sans, color: muted });
  page.drawText(`Top 5 · ${profile.traits.slice(0, 5).map((trait) => trait.name).join(" · ")}`, { x: 52, y: 88, size: 9, font: fonts.sans, color: accent });
  page.drawText("01 / 24", { x: width - 92, y: 29, size: 8, font: fonts.sans, color: muted });
}

function pageFromSpec(pdf: PDFDoc, fonts: Fonts, spec: PdfPageSpec, pageNumber: number) {
  const { page, cursor } = addHeader(pdf, fonts, spec.kicker, spec.title, spec.lead, pageNumber);
  drawSections(page, fonts, spec.sections, cursor);
}

function strengthPages(pdf: PDFDoc, fonts: Fonts, profile: ScoreProfile, report: ReportJSON, startPage: number) {
  let pageNumber = startPage;
  for (const strength of report.topStrengths.slice(0, 5)) {
    const trait = profile.traits.find((candidate) => candidate.code === strength.trait);
    {
      const { page, cursor } = addHeader(
        pdf,
        fonts,
        `Top ${trait?.rank ?? pageNumber - startPage + 1}`,
        trait?.name ?? strength.trait,
        strength.contribution,
        pageNumber,
      );
      pageNumber += 1;
      let y = cursor;
      const { width } = page.getSize();
      for (const line of strength.manifestations) {
        y = drawQuote(page, fonts, line, 46, y, width - 92);
      }
      drawWrapped(
        page,
        trait ? `Standard score ${trait.standardScore}; пилотный индекс профиля ${trait.profileIndex}; диапазон неопределённости ${trait.uncertaintyRange[0]}—${trait.uncertaintyRange[1]}.` : "Числовой контекст недоступен.",
        fonts.sans,
        46,
        y,
        width - 92,
        10,
        muted,
        15,
      );
    }
    {
      const { page, cursor } = addHeader(pdf, fonts, "Практика", `Использовать ${trait?.name ?? "эту силу"} бережно.`, strength.overuseRisk, pageNumber);
      pageNumber += 1;
      drawSections(page, fonts, [
        { label: "Риск overuse", body: strength.overuseRisk },
        { label: "Наблюдаемые шаги", body: strength.developmentActions.join("\n") },
        { label: "Вопрос к себе", body: `В какой ситуации ${trait?.name ?? "этот режим"} уже помог, а в какой его стало слишком много?` },
      ], cursor);
    }
  }
  return pageNumber;
}

function profilePages(pdf: PDFDoc, fonts: Fonts, traits: ScoreProfile["traits"], totalCount: number, startPage: number) {
  let pageNumber = startPage;
  const chunk = 10;
  for (let offset = 0; offset < traits.length; offset += chunk) {
    const slice = traits.slice(offset, offset + chunk);
    const { page, cursor } = addHeader(
      pdf,
      fonts,
      `Полный профиль · ${offset + 1}–${offset + slice.length} из ${totalCount}`,
      "Все шкалы в одном поле",
      "Числа показывают текущий срез. Интервал — диапазон, в котором может находиться оценка при повторном измерении.",
      pageNumber,
    );
    pageNumber += 1;
    const { width } = page.getSize();
    let y = cursor;
    slice.forEach((trait) => {
      const color = domainColor(traits.indexOf(trait));
      page.drawRectangle({ x: 46, y: y - 12, width: 5, height: 17, color });
      page.drawText(String(trait.rank).padStart(2, "0"), { x: 58, y, size: 11, font: fonts.sans, color: muted });
      const nameLines = wrapText(trait.name, fonts.sansBold, 12, 250);
      page.drawText(nameLines[0] ?? "", { x: 92, y, size: 12, font: fonts.sansBold, color: ink });
      page.drawText(`${trait.standardScore}`, { x: 380, y, size: 12, font: fonts.sansBold, color: ink });
      page.drawText(`индекс ${trait.profileIndex}`, { x: 420, y, size: 9, font: fonts.sans, color: muted });
      page.drawText(`${trait.uncertaintyRange[0]}—${trait.uncertaintyRange[1]}`, { x: 500, y: y - 1, size: 9, font: fonts.sans, color: muted });
      page.drawLine({ start: { x: 46, y: y - 20 }, end: { x: width - 46, y: y - 20 }, thickness: 0.5, color: rule });
      y -= 44;
    });
  }
  return pageNumber;
}

export async function buildReportPdf(profile: ScoreProfile, report: ReportJSON) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  pdf.setProducer("T-Skills deterministic report generator");
  pdf.registerFontkit(fontkit);
  const fonts: Fonts = {
    serif: await pdf.embedFont(await fontBytes(loraData), { subset: true }),
    sans: await pdf.embedFont(await fontBytes(robotoData), { subset: true }),
    sansBold: await pdf.embedFont(await fontBytes(robotoBoldData), { subset: true }),
  };
  coverPage(pdf, fonts, profile, report);

  pageFromSpec(pdf, fonts, {
    kicker: "Как читать",
    title: "Сначала смысл, потом число.",
    lead: "T-Skills описывает предпочтительные режимы действия. Это не ярлык и не рейтинг ценности человека. Начните с первых десяти качеств, затем изучите остальные.",
    sections: [
      { label: "Укрепляйте", body: "Качества в верхней части профиля проявляются чаще всего. Опирайтесь на них в первую очередь и учитесь описывать их другим людям." },
      { label: "Изучайте", body: "Остальные шкалы — контекст и материал для наблюдений. Они могут включаться в отдельных ситуациях." },
      { label: "Слабые места", body: report.confidenceNote },
      { label: "Граница применения", body: "Результат подходит для самоанализа, разговора о взаимодействии и планирования развития. Он не предназначен для медицинских, кадровых, кредитных или иных высокозначимых решений." },
    ],
  }, 2);

  drawRankedList(pdf, fonts, profile.traits.slice(0, 10), 3, "Укрепляйте", "Десять опор.", "Наиболее выраженные способы действия в текущем профиле.");
  const rest = profile.traits.slice(10);
  if (rest.length) {
    drawRankedList(pdf, fonts, rest, 4, "Изучайте", "Остальной профиль.", "Контекст и материал для наблюдений, а не второй сорт.");
  } else {
    pageFromSpec(pdf, fonts, { kicker: "Изучайте", title: "Остальной профиль.", lead: "Все качества уже отражены выше." }, 4);
  }

  let pageNumber = strengthPages(pdf, fonts, profile, report, 5);

  pageFromSpec(pdf, fonts, { kicker: "Сочетания", title: "Силы работают не по одной.", lead: "Сочетания помогают перейти от списка к наблюдаемым ситуациям.", sections: report.combinations.map((item) => ({ label: item.title, body: item.text })) }, pageNumber);
  pageNumber += 1;
  pageFromSpec(pdf, fonts, { kicker: "Команда", title: "Что вы даёте и что полезно получать.", sections: [{ label: "Ваш вклад", body: report.teamwork.gives }, { label: "Полезная поддержка", body: report.teamwork.needs }, { label: "Совместная работа", body: report.collaborationStyle }, { label: "Коммуникация", body: report.communicationStyle }] }, pageNumber);
  pageNumber += 1;
  pageFromSpec(pdf, fonts, { kicker: "Решения", title: "Ваш способ двигаться к выбору.", lead: report.decisionStyle, sections: [{ label: "Мышление", body: report.thinkingStyle }, { label: "Выполнение", body: report.executionStyle }, { label: "Влияние", body: report.influenceStyle }, { label: "Проверка", body: "Перед решением отделите наблюдаемые факты от предположений и заранее назовите сигнал, который заставит пересмотреть выбор." }] }, pageNumber);
  pageNumber += 1;
  pageFromSpec(pdf, fonts, { kicker: "Условия", title: "Где рисунок может раскрываться.", sections: [{ label: "Рабочие среды", body: report.workEnvironments.join("\n") }, { label: "Самоуправление", body: report.selfManagementStyle }, { label: "Стресс и слепые зоны", body: report.stressAndBlindSpots }, { label: "Принцип", body: "Среда не обязана совпадать с профилем целиком. Важнее, чтобы были понятны условия, в которых сильные режимы доступны, и способы компенсации остальных." }] }, pageNumber);
  pageNumber += 1;
  pageFromSpec(pdf, fonts, { kicker: "30 дней", title: "План одного наблюдаемого месяца.", lead: "Выберите шаги, которые можно увидеть в календаре или в разговоре, а не только почувствовать.", sections: report.development30Days.map((action, index) => ({ label: `Шаг ${index + 1}`, body: action })) }, pageNumber);
  pageNumber += 1;

  pageNumber = profilePages(pdf, fonts, profile.traits, profile.traits.length, pageNumber);

  const coreQuestionCount = report.coreQuestionCount ?? profile.coreAnswered ?? T_SKILLS_STATIC_ITEM_COUNT;
  const adaptiveQuestionCount = report.adaptiveQuestionCount ?? profile.adaptiveAnswered ?? T_SKILLS_ADAPTIVE_MAX_QUESTIONS;
  pageFromSpec(pdf, fonts, { kicker: "Методология", title: "Что находится под результатом.", sections: [{ label: "Конструкт", body: `${profile.traits.length} оригинальных шкал. Эта версия использует ${coreQuestionCount} стандартизированных парных сравнений и ${adaptiveQuestionCount} карьерных уточнений.` }, { label: "Scoring", body: "Числа рассчитываются детерминированным engine. Интерпретационный слой не может изменить score JSON, rank, пилотный индекс профиля или диапазоны неопределённости." }, { label: "Статус норм", body: `normStatus: ${profile.normStatus}; нормативная выборка и валидированные популяционные нормы не заявляются.` }, { label: "Качество", body: `RQI ${Math.round(profile.responseQuality.rqi * 100)}%. Флаги качества показываются как повод для осторожного чтения, а не как автоматическое обнуление результата.` }] }, pageNumber);
  pageNumber += 1;
  pageFromSpec(pdf, fonts, { kicker: "Границы", title: "Этот отчёт не решает за вас.", lead: "T-Skills — развивающий инструмент собственного проекта, не лицензированная реализация Gallup/CliftonStrengths и не научное заключение.", sections: [{ label: "Нельзя использовать", body: "Для диагностики, оценки здоровья или интеллекта, автоматического найма/увольнения, кредита, страхования, допуска к образованию или другого решения, где цена ошибки высока." }, { label: "Можно использовать", body: "Для рефлексии, подготовки к разговору, распределения ролей и небольших экспериментов развития." }, { label: "Следующий шаг", body: "Сверьте выводы с собственными наблюдениями и обратной связью людей, которым вы доверяете. Если они расходятся, это повод исследовать контекст, а не выбрать «правильную» версию себя." }] }, pageNumber);
  pageNumber += 1;

  if (pageNumber - 1 !== TOTAL_PAGES) {
    throw new Error(`PDF_PAGE_COUNT_MISMATCH:${pageNumber - 1}`);
  }
  return pdf.save({ useObjectStreams: true });
}
