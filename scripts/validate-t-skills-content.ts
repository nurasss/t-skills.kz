import { readFile } from "node:fs/promises";

import { parseTSkillsContentBundleJson } from "@/lib/t-skills/content-bundle";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npm run content:t-skills:check -- ./path/to/t-skills-content.json");
  process.exitCode = 2;
} else {
  try {
    const json = await readFile(filePath, "utf8");
    const result = parseTSkillsContentBundleJson(json);
    if (!result.ok) {
      console.error(JSON.stringify({ status: "invalid", issues: result.issues }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({
        status: "valid",
        assessmentVersion: result.value.assessmentVersion,
        traitCount: result.value.traits.length,
        itemCount: result.value.items.length,
        professionCount: result.value.professions.length,
        versions: {
          traitTaxonomy: result.value.traitTaxonomyVersion,
          itemBank: result.value.itemBankVersion,
          careerCatalog: result.value.careerCatalogVersion,
        },
      }, null, 2));
    }
  } catch {
    console.error(JSON.stringify({ status: "invalid", code: "CONTENT_FILE_READ_FAILED" }));
    process.exitCode = 1;
  }
}
