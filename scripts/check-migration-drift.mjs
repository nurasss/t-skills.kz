import { execFileSync } from "node:child_process";

const root = process.cwd();
function run(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

run("npx", ["drizzle-kit", "check"]);
run("npm", ["run", "db:generate"]);
const drift = run("git", ["status", "--porcelain", "--", "db/schema.ts", "drizzle"]).trim();
if (drift) throw new Error("MIGRATION_DRIFT_DETECTED\n" + drift);
console.log("MIGRATION_DRIFT=PASS");
