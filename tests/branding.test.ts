import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { metadataForView } from "@/lib/view-routing";

const ROOT = resolve(import.meta.dirname, "..");

// Production-facing surface. Historical evidence (*.md/*.txt/RELEASE_MANIFEST),
// migrations (drizzle/), worker/infra names (wrangler.jsonc, worker/, .github/)
// and release scripts that assert manifest schema are intentionally out of scope:
// they preserve technical compatibility identifiers (see rebranding report).
const SCAN_DIRECTORIES = ["app", "lib", "hooks", "public"];
const SCAN_FILES = [
  ".env.example",
  "scripts/pdf-visual-fixtures.ts",
  "scripts/pdf-visual-qa.mjs",
  "tests/browser/csp.spec.ts",
  // Every unit-test file except this scanner itself (it necessarily names
  // the legacy tokens it guards against).
  ...readdirSync(join(ROOT, "tests"))
    .filter((entry) => entry.endsWith(".test.ts") && entry !== "branding.test.ts")
    .map((entry) => join("tests", entry)),
];

// Internal infrastructure identifiers that must keep working against
// production secrets, existing D1/R2 bindings and local smoke scripts.
const ALLOWED_ORBITA_ENV_TOKENS = new Set([
  "ORBITA_ENV",
  "ORBITA_ADMIN_USER_IDS",
  "ORBITA_INTERNAL_TOKEN",
  "ORBITA_DEPLOY_TARGET",
  "ORBITA_PDF_FIXTURE_DIR",
  "ORBITA_CI_GATES_PASSED",
]);

// Internal code identifiers (components, controller contract, env type).
// File names, CSS classes and lowercase storage keys are out of scope by design.
const ALLOWED_ORBITA_IDENTIFIERS = new Set([
  "OrbitaApp",
  "OrbitaController",
  "OrbitaControllerOptions",
  "OrbitaViewRouter",
  "OrbitaRuntimeEnv",
  "OrbitaAnimated",
  "OrbitaGraphic",
]);

const BARE_ORBITA = /(?<![A-Za-z])ORBITA(?![A-Za-z_])/g;
const BARE_ORBITA_TITLE = /(?<![A-Za-z])Orbita(?![A-Za-z])/g;
const ORBITA_ENV_TOKEN = /ORBITA[A-Z_]+/g;
const ORBITA_TITLE_IDENTIFIER = /Orbita[A-Za-z]+/g;

function collectFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) files.push(...collectFiles(full));
    else if (/\.(ts|tsx|mjs|js|css|svg|json|jsonc)$/.test(entry)) files.push(full);
  }
  return files;
}

function scanFile(path: string): string[] {
  const text = readFileSync(path, "utf8");
  const violations: string[] = [];
  for (const match of text.match(BARE_ORBITA) ?? []) violations.push(`legacy uppercase token "${match}"`);
  for (const match of text.match(BARE_ORBITA_TITLE) ?? []) violations.push(`legacy title-case token "${match}"`);
  for (const match of text.match(ORBITA_ENV_TOKEN) ?? []) {
    if (!ALLOWED_ORBITA_ENV_TOKENS.has(match)) violations.push(`unexpected ORBITA_* identifier "${match}"`);
  }
  for (const match of text.match(ORBITA_TITLE_IDENTIFIER) ?? []) {
    if (!ALLOWED_ORBITA_IDENTIFIERS.has(match)) violations.push(`unexpected Orbita* identifier "${match}"`);
  }
  return violations;
}

test("production-facing UI carries no legacy ORBITA brand", () => {
  const files = [
    ...SCAN_DIRECTORIES.flatMap((directory) => collectFiles(join(ROOT, directory))),
    ...SCAN_FILES.map((file) => join(ROOT, file)),
  ];
  assert.ok(files.length > 50, "branding scan must cover the production surface");
  const failures: string[] = [];
  for (const file of files) {
    for (const violation of scanFile(file)) failures.push(`${file.replace(`${ROOT}/`, "")}: ${violation}`);
  }
  assert.deepEqual(failures, []);
});

test("public brand is T-Skills across entry points", () => {
  const required: Record<string, string[]> = {
    "app/layout.tsx": ["T-Skills · Профиль ваших сильных сторон"],
    "lib/view-routing.ts": ["T-Skills · Профиль ваших сильных сторон", "Тест T-Skills", 'TEST_DETAIL_SLUG = "t-skills"', 'CHECKOUT_SLUG = "t-skills"'],
    "app/landing/landing-page.tsx": ["T-Skills"],
    "lib/pdf-generator.ts": ["T-Skills"],
    "lib/payment-provider.ts": ['name: "T-Skills"'],
    "lib/legal-documents.ts": ["T-Skills"],
    "public/og.svg": ["T-Skills"],
  };
  for (const [file, markers] of Object.entries(required)) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const marker of markers) assert.ok(text.includes(marker), `${file} must contain ${JSON.stringify(marker)}`);
  }
  assert.equal(metadataForView("home").title, "T-Skills · Профиль ваших сильных сторон");
  assert.equal(metadataForView("detail").title, "Тест T-Skills");
});
