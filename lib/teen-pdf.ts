/**
 * Teen-PDF: компактный отчёт (обложка, топ-5, качества, границы).
 * Отдельный рендерер на pdf-lib; взрослый генератор не трогаем.
 */
import { PDFDocument, PageSizes, rgb, type PDFDocument as PDFDoc, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

import { TEEN_VERSION_IDS } from "@/lib/t-skills/teen/taxonomy";
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

export function validateTeenReportPayload(value: unknown): asserts value is TeenReport {
  if (!value || typeof value !== "object") throw new Error("TEEN_PDF:shape");
  const report = value as TeenReport;
  for (const [key, expected] of Object.entries(TEEN_VERSION_IDS)) {
    if ((report.versions as Record<string, string> | undefined)?.[key] !== expected) throw new Error(`TEEN_PDF:version:${key}`);
  }
  if (!Array.isArray(report.careers) || report.careers.length === 0) throw new Error("TEEN_PDF:careers");
  if (!Array.isArray(report.traits) || report.traits.length !== 25) throw new Error("TEEN_PDF:traits");
  for (const career of report.careers) {
    if (!career.professionId || !career.title) throw new Error("TEEN_PDF:career:shape");
  }
}

export async function renderTeenPdf(report: TeenReport, fontData: TeenPdfFontData): Promise<Uint8Array> {
  validateTeenReportPayload(report);
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf, fontData);

  // Обложка
  {
    const { page, width, height } = newPage(pdf, fonts);
    page.drawText("T-SKILLS · TEEN", { x: 46, y: height - 50, size: 10, font: fonts.sansBold, color: ink });
    let cursor = drawWrapped(page, "Куда тебе с твоими качествами", fonts.serif, 46, height - 140, width - 92, 30, ink, 37) - 10;
    const date = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    cursor = drawWrapped(page, `Персональная подборка направлений · ${date}`, fonts.sans, 46, cursor, width - 92, 12.5, muted, 19) - 16;
    if (report.topValues.length > 0) {
      cursor = drawWrapped(page, `Важно: ${report.topValues.map((value) => value.name).join(" · ")}`, fonts.sansBold, 46, cursor, width - 92, 12, accent, 18) - 16;
    }
    drawWrapped(page, "Развивающий результат пилотного банка. Это не диагноз и не прогноз — а карта направлений, где твои качества раскрываются сильнее.", fonts.sans, 46, cursor, width - 92, 11.5, muted, 17);
  }

  // Топ-5: по странице на профессию
  report.careers.slice(0, 5).forEach((career, index) => {
    const { page, width, height } = newPage(pdf, fonts);
    page.drawText("T-SKILLS · TEEN", { x: 46, y: height - 50, size: 10, font: fonts.sansBold, color: ink });
    page.drawText(`НАПРАВЛЕНИЕ ${index + 1} ИЗ 5`, { x: 46, y: height - 86, size: 9, font: fonts.sansBold, color: accent });
    let cursor = drawWrapped(page, career.title, fonts.serif, 46, height - 126, width - 92, 26, ink, 33) - 8;
    const meta = [career.sphere, career.klimovType, career.education].filter(Boolean).join(" · ");
    if (meta) cursor = drawWrapped(page, meta, fonts.sans, 46, cursor, width - 92, 11, muted, 17) - 12;
    page.drawLine({ start: { x: 46, y: cursor }, end: { x: width - 46, y: cursor }, thickness: 0.7, color: rule });
    cursor -= 24;
    drawWrapped(page, career.description || "Описание уточняется.", fonts.sans, 46, cursor, width - 92, 11.5, ink, 17.5);
  });

  // Качества
  {
    const { page, width, height } = newPage(pdf, fonts);
    page.drawText("T-SKILLS · TEEN", { x: 46, y: height - 50, size: 10, font: fonts.sansBold, color: ink });
    page.drawText("ТВОИ КАЧЕСТВА", { x: 46, y: height - 86, size: 9, font: fonts.sansBold, color: accent });
    let cursor = drawWrapped(page, "Топ-5 качеств", fonts.serif, 46, height - 126, width - 92, 24, ink, 30) - 10;
    for (const trait of report.traits.slice(0, 5)) {
      cursor = drawWrapped(page, `• ${trait.name}`, fonts.sansBold, 46, cursor, width - 92, 12, ink, 18) - 4;
    }
    cursor -= 12;
    cursor = drawWrapped(page, "Весь профиль (25 качеств, от сильных к менее выраженным)", fonts.serif, 46, cursor, width - 92, 16, ink, 22) - 8;
    const rest = report.traits.map((trait) => trait.name).join(" · ");
    cursor = drawWrapped(page, rest, fonts.sans, 46, cursor, width - 92, 10, muted, 15) - 16;
    drawWrapped(page, "Границы: пилотный банк, веса профессий и бонусы — версия v1, калибровка продолжается. Подробности методики — на странице «Методология».", fonts.sans, 46, cursor, width - 92, 10.5, muted, 16);
  }

  // Нумерация
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    page.drawText(`${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`, { x: width - 92, y: 29, size: 8, font: fonts.sans, color: muted });
  });

  return pdf.save();
}
