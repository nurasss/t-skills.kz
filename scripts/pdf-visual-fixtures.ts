import { mkdir, writeFile } from "node:fs/promises";

import { buildReport, scoreAssessment } from "@/lib/assessment-engine";
import { buildReportPdf } from "@/lib/pdf-generator";
import { responsesForRecipe } from "@/tests/scoring-fixtures";

const fixtures = [
  { name: "analytical", recipe: { kind: "domain", domainIndex: 0 } as const },
  { name: "execution", recipe: { kind: "domain", domainIndex: 2 } as const },
  { name: "balanced-long-text", recipe: { kind: "balanced" } as const, long: true },
  { name: "low-confidence", recipe: { kind: "contradictory-low-confidence" } as const },
];

const outputDirectory = process.env.ORBITA_PDF_FIXTURE_DIR ?? "output/pdf";
await mkdir(outputDirectory, { recursive: true });
for (const fixture of fixtures) {
  const profile = scoreAssessment(responsesForRecipe(fixture.recipe));
  const report = buildReport(profile);
  if (fixture.long) {
    report.executiveSummary = `${report.executiveSummary} ${report.executiveSummary} ${report.executiveSummary}`;
    report.stressAndBlindSpots = `${report.stressAndBlindSpots} ${report.stressAndBlindSpots}`;
  }
  const bytes = await buildReportPdf(profile, report);
  await writeFile(`${outputDirectory}/t-skills-${fixture.name}.pdf`, bytes);
  console.log(`PDF_FIXTURE=${fixture.name} top5=${profile.traits.slice(0, 5).map((trait) => trait.code).join(",")}`);
}
