// Test-only ESM resolve hook: maps the Cloudflare runtime import and the
// `@/` path alias to local files so lib modules that depend on
// `cloudflare:workers` can be exercised in plain Node integration tests.
// Production code is untouched.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STUB = pathToFileURL(path.join(ROOT, "tests", "helpers", "cf-workers-stub.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: STUB, shortCircuit: true };
  }
  if (specifier === "@" || specifier.startsWith("@/")) {
    const rel = specifier === "@" ? "" : specifier.slice(2);
    return { url: pathToFileURL(path.join(ROOT, rel)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
