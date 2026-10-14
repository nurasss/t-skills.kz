/**
 * Teen-PDF: компактный отчёт (обложка, топ-5, качества, границы).
 * Отдельный рендерер на pdf-lib; взрослый генератор не трогаем.
 */
import { PDFDocument, PageSizes, rgb, type PDFDocument as PDFDoc, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

import { TEEN_SUBJECTS, TEEN_TRAIT_IDS, TEEN_V1_FIX_VERSION_IDS, TEEN_V1_VERSION_IDS, TEEN_V3_VERSION_IDS, TEEN_V4_VERSION_IDS, TEEN_V5_VERSION_IDS, TEEN_VALUES, TEEN_VERSION_IDS } from "@/lib/t-skills/teen/taxonomy";
import { teenRuntimeContent, type TeenRuntimeLocale } from "@/lib/t-skills/teen/runtime";
import { TEEN_CAREER_CATALOG_V1, teenCareerEntry } from "@/lib/t-skills/teen/careers";
import type { TeenReport } from "@/lib/t-skills/teen/report";

/** Шрифты инжектятся (Next `?inline` не работает под tsx-тестами). */
export type TeenPdfFontData = { sans: Uint8Array | string; sansBold: Uint8Array | string; serif: Uint8Array | string };

const ink = rgb(0.102, 0.094, 0.082);
const muted = rgb(0.431, 0.396, 0.345);
const accent = rgb(0.102, 0.478, 0.29);
const paper = rgb(0.965, 0.955, 0.925);
const rule = rgb(0.788, 0.745, 0.651);

type Fonts = { serif: PDFFont; sans: PDFFont; sansBold: PDFFont };

function decodeDataUrl(value: string) {
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function fontBytes(data: Uint8Array | string) {
  if (data instanceof Uint8Array) return data;
  if (data.startsWith("data:")) return decodeDataUrl(data);
  const response = await fetch(data);
  if (!response.ok) throw new Error("TEEN_PDF_FONT_UNAVAILABLE");
  return new Uint8Array(await response.arrayBuffer());
}

async function loadFonts(pdf: PDFDoc, fontData: TeenPdfFontData): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  const [sans, sansBold, serif] = await Promise.all([
    pdf.embedFont(await fontBytes(fontData.sans)),
    pdf.embedFont(await fontBytes(fontData.sansBold)),
    pdf.embedFont(await fontBytes(fontData.serif)),
  ]);
  return { sans, sansBold, serif };
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

function drawWrapped(page: PDFPage, text: string, font: PDFFont, x: number, y: number, width: number, size: number, color = ink, lineHeight = size * 1.45) {
  let cursor = y;
  for (const line of wrapText(text, font, size, width)) {
    page.drawText(line, { x, y: cursor, size, font, color });
    cursor -= lineHeight;
  }
  return cursor;
}

function newPage(pdf: PDFDoc, fonts: Fonts) {
  const page = pdf.addPage(PageSizes.A4);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: paper });
  page.drawText("T-SKILLS · TEEN", { x: 46, y: height - 50, size: 10, font: fonts.sansBold, color: ink });
  return { page, width, height };
}

export function validateTeenReportPayload(value: unknown, locale: TeenRuntimeLocale = "ru"): asserts value is TeenReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TEEN_PDF:shape");
  const report = value as TeenReport;
  const expectedVersions = report.versions?.assessment === TEEN_V1_VERSION_IDS.assessment
    ? TEEN_V1_VERSION_IDS
    : report.versions?.assessment === TEEN_V1_FIX_VERSION_IDS.assessment
      ? TEEN_V1_FIX_VERSION_IDS
      : report.versions?.assessment === TEEN_VERSION_IDS.assessment ? TEEN_VERSION_IDS
        : report.versions?.assessment === TEEN_V5_VERSION_IDS.assessment ? TEEN_V5_VERSION_IDS
        : report.versions?.assessment === TEEN_V4_VERSION_IDS.assessment ? TEEN_V4_VERSION_IDS
        : report.versions?.assessment === TEEN_V3_VERSION_IDS.assessment ? TEEN_V3_VERSION_IDS : null;
  if (!expectedVersions) throw new Error("TEEN_PDF:version:assessment");
  const content = teenRuntimeContent(locale, expectedVersions.assessment);
  const catalogVersion = (expectedVersions as { careerCatalog?: unknown }).careerCatalog;
  const careerCatalogVersion = typeof catalogVersion === "string" ? catalogVersion : TEEN_CAREER_CATALOG_V1;
  for (const [key, expected] of Object.entries(expectedVersions)) {
    if ((report.versions as Record<string, string> | undefined)?.[key] !== expected) throw new Error(`TEEN_PDF:version:${key}`);
  }
  if (report.contentStatus !== content.status || report.contentStatus !== "PUBLISHED") throw new Error("TEEN_PDF:content_status");
  if (!Array.isArray(report.careers) || report.careers.length === 0 || report.careers.length > 5) throw new Error("TEEN_PDF:careers");
  if (!Array.isArray(report.traits) || report.traits.length !== 25) throw new Error("TEEN_PDF:traits");
  const traitIds = new Set<string>();
  for (const career of report.careers) {
    if (!career || typeof career !== "object") throw new Error("TEEN_PDF:career:shape");
    if (typeof career.professionId !== "string" || !career.professionId.trim() || career.professionId.length > 128) throw new Error("TEEN_PDF:career:id");
    if (typeof career.title !== "string" || !career.title.trim() || career.title.length > 256) throw new Error("TEEN_PDF:career:title");
    const textFields = [career.sphere, career.klimovType, career.education, career.description];
    if (textFields.some((field) => typeof field !== "string" || field.length > 2_048)) throw new Error("TEEN_PDF:career:text");
    const profession = teenCareerEntry(careerCatalogVersion, career.professionId, locale);
    if (!profession || career.title !== profession.title || career.sphere !== profession.sphere || career.klimovType !== profession.klimovType || career.education !== profession.education || career.description !== profession.description) {
      throw new Error("TEEN_PDF:career:content");
    }
    for (const score of [career.totalScore, career.traitScore, career.valueBonus, career.subjectBonus]) {
      if (typeof score !== "number" || !Number.isFinite(score)) throw new Error("TEEN_PDF:career:score");
    }
  }
  for (const trait of report.traits) {
    if (!trait || typeof trait !== "object" || !(TEEN_TRAIT_IDS as readonly string[]).includes(trait.traitId) || traitIds.has(trait.traitId) || trait.name !== content.traitNames[trait.traitId]) {
      throw new Error("TEEN_PDF:trait:shape");
    }
    traitIds.add(trait.traitId);
    if (typeof trait.total !== "number" || !Number.isFinite(trait.total) || typeof trait.normalized !== "number" || !Number.isFinite(trait.normalized)) {
      throw new Error("TEEN_PDF:trait:score");
    }
  }
  if (!Array.isArray(report.topTraits) || report.topTraits.length > 5 || report.topTraits.some((trait) => !trait || typeof trait !== "object" || !traitIds.has(trait.traitId) || trait.name !== content.traitNames[trait.traitId])) throw new Error("TEEN_PDF:top_traits");
  if (!Array.isArray(report.topValues) || report.topValues.length > 3) throw new Error("TEEN_PDF:top_values");
  if (!Array.isArray(report.subjects) || report.subjects.length > 13) throw new Error("TEEN_PDF:subjects");
  for (const value of report.topValues) {
    if (!value || typeof value !== "object") throw new Error("TEEN_PDF:value:shape");
    const valueId = value.id as (typeof TEEN_VALUES)[number];
    if (!(TEEN_VALUES as readonly string[]).includes(value.id) || value.name !== content.valueNames[valueId]) throw new Error("TEEN_PDF:value:shape");
  }
  for (const subject of report.subjects) {
    if (!subject || typeof subject !== "object") throw new Error("TEEN_PDF:subject:shape");
    const subjectId = subject.id as (typeof TEEN_SUBJECTS)[number];
    if (!(TEEN_SUBJECTS as readonly string[]).includes(subject.id) || subject.name !== content.subjectNames[subjectId]) throw new Error("TEEN_PDF:subject:shape");
  }
}

export type TeenPdfLocale = "ru" | "kk";

const TEEN_PDF_STRINGS: Record<TeenPdfLocale, {
  coverTitle: string; coverLead: (date: string) => string; important: string; coverNote: string;
  direction: (n: number) => string; noDescription: string;
  traitsKicker: string; topTraits: string; fullProfile: string; methodNote: string; footer: string;
}> = {
  ru: {
    coverTitle: "Куда тебе с твоими качествами",
    coverLead: (date) => `Персональная подборка направлений · ${date}`,
    important: "Важно",
    coverNote: "Развивающий результат пилотного банка. Это не диагноз и не прогноз — а карта направлений, где твои качества раскрываются сильнее.",
    direction: (n) => `НАПРАВЛЕНИЕ ${n} ИЗ 5`,
    noDescription: "Описание уточняется.",
    traitsKicker: "ТВОИ КАЧЕСТВА",
    topTraits: "Топ-5 качеств",
    fullProfile: "Весь профиль (25 качеств, от сильных к менее выраженным)",
    methodNote: "Границы: пилотный банк, веса профессий и бонусы — версия v1, калибровка продолжается. Подробности методики — на странице «Методология».",
    footer: "Развивающий профиль · не диагностика · не прогноз",
  },
  kk: {
    coverTitle: "Қасиеттеріңмен қайда барасың",
    coverLead: (date) => `Бағыттардың жеке іріктемесі · ${date}`,
    important: "Маңызды",
    coverNote: "Пилоттық банктің дамытушы нәтижесі. Бұл диагноз да, болжам да емес — қасиеттерің жарқырай көрінетін бағыттар картасы.",
    direction: (n) => `${n}-БАҒЫТ / 5`,
    noDescription: "Сипаттама нақтылануда.",
    traitsKicker: "СЕНІҢ ҚАСИЕТТЕРІҢ",
    topTraits: "Топ-5 қасиет",
    fullProfile: "Толық бейін (25 қасиет, мықтыдан әлсізге қарай)",
    methodNote: "Шектеулер: пилоттық банк, мамандық салмақтары мен бонустар — v1 нұсқасы, калибрлеу жалғасуда. Әдістеме «Методология» бетінде.",
    footer: "Дамытушы бейін · диагностика емес · болжам емес",
  },
};

export async function renderTeenPdf(report: TeenReport, fontData: TeenPdfFontData, locale: TeenPdfLocale = "ru"): Promise<Uint8Array> {
  validateTeenReportPayload(report, locale);
  const t = TEEN_PDF_STRINGS[locale];
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf, fontData);

  // Обложка
  {
    const { page, width, height } = newPage(pdf, fonts);
    page.drawText("T-SKILLS · TEEN", { x: 46, y: height - 50, size: 10, font: fonts.sansBold, color: ink });
    let cursor = drawWrapped(page, t.coverTitle, fonts.serif, 46, height - 140, width - 92, 30, ink, 37) - 10;
    const date = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    cursor = drawWrapped(page, t.coverLead(date), fonts.sans, 46, cursor, width - 92, 12.5, muted, 19) - 16;
    if (report.topValues.length > 0) {
      cursor = drawWrapped(page, `${t.important}: ${report.topValues.map((value) => value.name).join(" · ")}`, fonts.sansBold, 46, cursor, width - 92, 12, accent, 18) - 16;
    }
    drawWrapped(page, t.coverNote, fonts.sans, 46, cursor, width - 92, 11.5, muted, 17);
  }

  // Топ-5: по странице на профессию
  report.careers.slice(0, 5).forEach((career, index) => {
    const { page, width, height } = newPage(pdf, fonts);
    page.drawText("T-SKILLS · TEEN", { x: 46, y: height - 50, size: 10, font: fonts.sansBold, color: ink });
    page.drawText(t.direction(index + 1), { x: 46, y: height - 86, size: 9, font: fonts.sansBold, color: accent });
    let cursor = drawWrapped(page, career.title, fonts.serif, 46, height - 126, width - 92, 26, ink, 33) - 8;
    const meta = [career.sphere, career.klimovType, career.education].filter(Boolean).join(" · ");
    if (meta) cursor = drawWrapped(page, meta, fonts.sans, 46, cursor, width - 92, 11, muted, 17) - 12;
    page.drawLine({ start: { x: 46, y: cursor }, end: { x: width - 46, y: cursor }, thickness: 0.7, color: rule });
    cursor -= 24;
    drawWrapped(page, career.description || t.noDescription, fonts.sans, 46, cursor, width - 92, 11.5, ink, 17.5);
  });

  // Качества
  {
    const { page, width, height } = newPage(pdf, fonts);
    page.drawText("T-SKILLS · TEEN", { x: 46, y: height - 50, size: 10, font: fonts.sansBold, color: ink });
    page.drawText(t.traitsKicker, { x: 46, y: height - 86, size: 9, font: fonts.sansBold, color: accent });
    let cursor = drawWrapped(page, t.topTraits, fonts.serif, 46, height - 126, width - 92, 24, ink, 30) - 10;
    for (const trait of report.traits.slice(0, 5)) {
      cursor = drawWrapped(page, `• ${trait.name}`, fonts.sansBold, 46, cursor, width - 92, 12, ink, 18) - 4;
    }
    cursor -= 12;
    cursor = drawWrapped(page, t.fullProfile, fonts.serif, 46, cursor, width - 92, 16, ink, 22) - 8;
    const rest = report.traits.map((trait) => trait.name).join(" · ");
    cursor = drawWrapped(page, rest, fonts.sans, 46, cursor, width - 92, 10, muted, 15) - 16;
    drawWrapped(page, t.methodNote, fonts.sans, 46, cursor, width - 92, 10.5, muted, 16);
  }

  // Нумерация
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    page.drawText(`${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`, { x: width - 92, y: 29, size: 8, font: fonts.sans, color: muted });
  });

  return pdf.save();
}
