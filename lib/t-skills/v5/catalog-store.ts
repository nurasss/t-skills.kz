import type { ProfessionV5, V5TraitDefinition } from "@/lib/t-skills/v5/contracts";
import { validateV5CareerCatalog } from "@/lib/t-skills/v5/career";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

type ProfessionRow = {
  id: string;
  title: string;
  description: string;
  trait_weights_json: string;
  subject_tags_json: string;
  dimensions_json: string;
  rules_json: string;
  roadmap_json: string;
  active: number;
  version: string;
};

function parseJson(value: string | null | undefined, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function rowToProfession(row: ProfessionRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    traitWeights: parseJson(row.trait_weights_json, {}),
    subjectTags: parseJson(row.subject_tags_json, []),
    dimensions: parseJson(row.dimensions_json, {}),
    rules: parseJson(row.rules_json, []),
    roadmap: parseJson(row.roadmap_json, {}),
    active: row.active === 1,
    version: row.version,
  };
}

function validatedCatalog(input: unknown, traits: readonly V5TraitDefinition[], version: string) {
  const result = validateV5CareerCatalog(input, traits, version);
  if (!result.ok) throw new Error(result.issues.map((issue) => `${issue.code}:${issue.path}`).join(","));
  return result.value;
}

/** Load only the active profession version used by a v5 matching run. */
export async function loadV5CareerCatalog(input: {
  database: Pick<D1Database, "prepare">;
  traits: readonly V5TraitDefinition[];
  version?: string;
}) {
  const version = input.version ?? T_SKILLS_V5_VERSION_IDS.careerCatalog;
  const result = await input.database
    .prepare(
      `SELECT id, title, description, trait_weights_json, subject_tags_json,
              dimensions_json, rules_json, roadmap_json, active, version
       FROM t_skills_professions
       WHERE version = ? AND active = 1 ORDER BY id ASC`,
    )
    .bind(version)
    .all<ProfessionRow>();
  return validatedCatalog((result.results ?? []).map(rowToProfession), input.traits, version);
}

/**
 * Import an already validated catalog atomically. The profession id is the
 * stable key; the version stored with each row prevents a caller from
 * silently mixing catalog versions in one write.
 */
export async function upsertV5CareerCatalog(input: {
  database: D1Database;
  professions: readonly ProfessionV5[];
  traits: readonly V5TraitDefinition[];
  version?: string;
  nowMs?: number;
}) {
  const version = input.version ?? T_SKILLS_V5_VERSION_IDS.careerCatalog;
  const professions = validatedCatalog(input.professions, input.traits, version);
  const activeCount = professions.filter((profession) => profession.active).length;
  if (activeCount < 5) throw new Error("CAREER_CATALOG_ACTIVE_COUNT");
  const timestamp = input.nowMs ?? Date.now();
  await input.database.batch(
    professions.map((profession) => input.database.prepare(
      `INSERT INTO t_skills_professions
        (id, title, description, trait_weights_json, subject_tags_json,
         dimensions_json, rules_json, roadmap_json, active, version,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         trait_weights_json = excluded.trait_weights_json,
         subject_tags_json = excluded.subject_tags_json,
         dimensions_json = excluded.dimensions_json,
         rules_json = excluded.rules_json,
         roadmap_json = excluded.roadmap_json,
         active = excluded.active,
         version = excluded.version,
         updated_at = excluded.updated_at`,
    ).bind(
      profession.id,
      profession.title,
      profession.description,
      JSON.stringify(profession.traitWeights),
      JSON.stringify(profession.subjectTags),
      JSON.stringify(profession.dimensions),
      JSON.stringify(profession.rules),
      JSON.stringify(profession.roadmap),
      profession.active ? 1 : 0,
      profession.version,
      timestamp,
      timestamp,
    )),
  );
  return { version, imported: professions.length, active: activeCount };
}
