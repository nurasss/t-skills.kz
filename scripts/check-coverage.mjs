import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const summary = JSON.parse(readFileSync(resolve("coverage/coverage-summary.json"), "utf8"));
const requirements = new Map([
  ["assessment-engine.ts", 90],
  ["adaptive-contract.ts", 90],
  ["payment-event-policy.ts", 90],
  ["payment-integrity.ts", 90],
  ["pdf-token-policy.ts", 90],
  ["security-headers.ts", 90],
  ["ownership-policy.ts", 90],
  ["stripe-signature.ts", 90],
]);

const failures = [];
if ((summary.total?.branches?.pct ?? 0) < 80) {
  failures.push("TOTAL_LIB_BRANCH_COVERAGE:" + (summary.total?.branches?.pct ?? 0) + "<80");
}
for (const [suffix, minimum] of requirements) {
  const entry = Object.entries(summary).find(([path]) => path.replace(/\\/g, "/").endsWith("/lib/" + suffix));
  const actual = entry?.[1]?.branches?.pct ?? 0;
  if (actual < minimum) failures.push(suffix + ":" + actual + "<" + minimum);
}
if (failures.length) throw new Error("COVERAGE_GATE_FAILED\n" + failures.join("\n"));
console.log("COVERAGE_GATE=PASS total_lib_branches=" + summary.total.branches.pct);
