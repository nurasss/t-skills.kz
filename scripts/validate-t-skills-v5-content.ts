import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTSkillsV5ContentBundleJson } from "@/lib/t-skills/v5/content-bundle";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run content:t-skills:v5:check -- ./path/to/t-skills-v5-content.json");
  process.exitCode = 2;
} else {
  try {
    const result = parseTSkillsV5ContentBundleJson(readFileSync(resolve(file), "utf8"));
    if (!result.ok) {
      console.error(JSON.stringify({ status: "invalid", issues: result.issues }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({
        status: "valid",
        assessmentVersion: result.value.assessmentVersion,
        traits: result.value.traits.length,
        items: result.value.items.length,
        clarificationItems: result.value.clarificationItems.length,
        careerTieBreakQuestions: result.value.careerTieBreakQuestions.length,
        professions: result.value.professions.length,
      }, null, 2));
    }
  } catch {
    console.error(JSON.stringify({ status: "invalid", code: "CONTENT_FILE_READ_FAILED" }));
    process.exitCode = 1;
  }
}
