import { existsSync, readFileSync } from "node:fs";

const promptFiles = ["lib/prompts/mercury-adaptive-v1.ts", "lib/adaptive-provider.ts", "lib/report-provider.ts"];
const missing = promptFiles.filter((file) => !existsSync(file));
const source = promptFiles.filter((file) => existsSync(file)).map((file) => readFileSync(file, "utf8")).join("\n");
const unsafe = ["ignore previous instructions", "reveal the system prompt", "<script", "dangerouslySetInnerHTML"].filter((pattern) => source.toLowerCase().includes(pattern.toLowerCase()));
const unversioned = promptFiles.filter((file) => existsSync(file) && !/VERSION/.test(readFileSync(file, "utf8")));
if (missing.length || unsafe.length || unversioned.length) {
  console.error(`PROMPT_CHECK_FAILED missing=${missing.join(",")} unsafe=${unsafe.join(",")} unversioned=${unversioned.join(",")}`);
  process.exit(1);
}
console.log(`PROMPT_CHECK=PASS files=${promptFiles.length} versioned=YES unsafe_markers=0`);
