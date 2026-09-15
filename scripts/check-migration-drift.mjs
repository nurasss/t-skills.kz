import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
function run(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function snapshotTree(directory) {
  const files = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        files.push([
          relative(root, absolute),
          createHash("sha256").update(readFileSync(absolute)).digest("hex"),
        ]);
      }
    }
  }
  visit(directory);
  return files;
}

const before = snapshotTree(join(root, "drizzle"));
run("npx", ["drizzle-kit", "check"]);
run("npm", ["run", "db:generate"]);
const after = snapshotTree(join(root, "drizzle"));
const beforeMap = new Map(before);
const afterMap = new Map(after);
const changed = [...new Set([...beforeMap.keys(), ...afterMap.keys()])]
  .filter((file) => beforeMap.get(file) !== afterMap.get(file))
  .sort();
if (changed.length) throw new Error("MIGRATION_DRIFT_DETECTED\n" + changed.join("\n"));

if (statSync(join(root, ".git"), { throwIfNoEntry: false })) {
  const gitDrift = run("git", ["status", "--porcelain", "--", "db/schema.ts", "drizzle"]).trim();
  if (gitDrift) throw new Error("MIGRATION_DRIFT_DETECTED\n" + gitDrift);
}
console.log("MIGRATION_DRIFT=PASS");
