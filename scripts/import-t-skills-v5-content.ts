import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTSkillsV5ContentBundleJson } from "@/lib/t-skills/v5/content-bundle";

const source = process.argv[2];
const target = process.argv[3] ?? "lib/t-skills/v5/production-content.ts";

if (!source) {
  console.error("Usage: npm run content:t-skills:v5:import -- ./path/to/t-skills-v5-content.json [output.ts]");
  process.exitCode = 2;
} else {
  try {
    const sourcePath = resolve(source);
    const result = parseTSkillsV5ContentBundleJson(readFileSync(sourcePath, "utf8"));
    if (!result.ok) {
      console.error(JSON.stringify({ status: "invalid", issues: result.issues }, null, 2));
      process.exitCode = 1;
    } else {
      const output = [
        "/** Generated from a client-approved T-Skills v5 content bundle. */",
        "export const T_SKILLS_V5_IMPORTED_CONTENT: unknown = ",
        JSON.stringify(result.value, null, 2),
        " as const;",
        "",
      ].join("\n");
      writeFileSync(resolve(target), output, "utf8");
      console.log(JSON.stringify({ status: "imported", source: sourcePath, target: resolve(target), professions: result.value.professions.length, items: result.value.items.length }, null, 2));
    }
  } catch {
    console.error(JSON.stringify({ status: "invalid", code: "CONTENT_IMPORT_FAILED" }));
    process.exitCode = 1;
  }
}
