import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";

const directory = process.env.ORBITA_PDF_FIXTURE_DIR ?? "output/pdf";
const renderDirectory = "tmp/pdfs/visual-regression";
rmSync(renderDirectory, { recursive: true, force: true });
mkdirSync(renderDirectory, { recursive: true });
const files = readdirSync(directory).filter((file) => /^orbita-30-(analytical|execution|balanced-long-text|low-confidence)\.pdf$/.test(file)).sort();
if (files.length !== 4) throw new Error(`PDF_VISUAL_FIXTURE_COUNT:${files.length}`);

for (const file of files) {
  const path = `${directory}/${file}`;
  const pdf = await PDFDocument.load(readFileSync(path));
  if (pdf.getPageCount() !== 24) throw new Error(`PDF_PAGE_COUNT:${file}:${pdf.getPageCount()}`);
  for (const [index, page] of pdf.getPages().entries()) {
    const { width, height } = page.getSize();
    if (Math.abs(width - 595.28) > 1 || Math.abs(height - 841.89) > 1) throw new Error(`PDF_NOT_A4:${file}:${index + 1}`);
  }
  const prefix = `${renderDirectory}/${file.replace(/\.pdf$/, "")}`;
  execFileSync("pdftoppm", ["-f", "1", "-l", "24", "-r", "90", "-png", path, prefix], { stdio: "ignore" });
  const pngs = readdirSync(renderDirectory).filter((entry) => entry.startsWith(file.replace(/\.pdf$/, "") + "-") && entry.endsWith(".png"));
  if (pngs.length !== 24) throw new Error(`PDF_RENDER_COUNT:${file}:${pngs.length}`);
  console.log(`PDF_VISUAL_QA=${file} pages=24 a4=PASS render=PASS`);
}
