import { getRuntimeEnv } from "@/db";
import { buildReport, type ReportJSON, type ScoreProfile } from "@/lib/assessment-engine";
import { TRAITS, type TraitCode } from "@/lib/item-bank";

export type GeneratedReport = {
  report: ReportJSON;
  provider: "openai" | "approved-library";
};

const reportSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    executiveSummary: { type: "string" },
    topStrengths: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          trait: { type: "string" },
          contribution: { type: "string" },
          manifestations: { type: "array", items: { type: "string" } },
          bestConditions: { type: "array", items: { type: "string" } },
          overuseRisk: { type: "string" },
          developmentActions: { type: "array", items: { type: "string" } },
        },
        required: [
          "trait",
          "contribution",
          "manifestations",
          "bestConditions",
          "overuseRisk",
          "developmentActions",
        ],
      },
    },
    combinations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, text: { type: "string" } },
        required: ["title", "text"],
      },
    },
    teamwork: {
      type: "object",
      additionalProperties: false,
      properties: { gives: { type: "string" }, needs: { type: "string" } },
      required: ["gives", "needs"],
    },
    decisionStyle: { type: "string" },
    workEnvironments: { type: "array", items: { type: "string" } },
    development30Days: { type: "array", items: { type: "string" } },
    confidenceNote: { type: "string" },
  },
  required: [
    "executiveSummary",
    "topStrengths",
    "combinations",
    "teamwork",
    "decisionStyle",
    "workEnvironments",
    "development30Days",
    "confidenceNote",
  ],
} as const;

const traitCodes = new Set(TRAITS.map((trait) => trait.code));

export class ReportProviderError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "ReportProviderError";
  }
}

function isStringArray(value: unknown, min = 1, max = 12): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 700)
  );
}

function isReportJSON(value: unknown): value is ReportJSON {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  if (typeof report.executiveSummary !== "string" || report.executiveSummary.length > 2400) return false;
  if (!Array.isArray(report.topStrengths) || report.topStrengths.length < 1 || report.topStrengths.length > 5) return false;
  for (const item of report.topStrengths) {
    if (!item || typeof item !== "object") return false;
    const strength = item as Record<string, unknown>;
    if (typeof strength.trait !== "string" || !traitCodes.has(strength.trait as TraitCode)) return false;
    if (typeof strength.contribution !== "string" || typeof strength.overuseRisk !== "string") return false;
    if (strength.contribution.length > 1200 || strength.overuseRisk.length > 1200) return false;
    if (!isStringArray(strength.manifestations) || !isStringArray(strength.bestConditions) || !isStringArray(strength.developmentActions)) return false;
  }
  if (!Array.isArray(report.combinations) || report.combinations.length < 1 || report.combinations.length > 5) return false;
  if (!report.combinations.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).title === "string" && typeof (item as Record<string, unknown>).text === "string")) return false;
  if (!report.teamwork || typeof report.teamwork !== "object") return false;
  const teamwork = report.teamwork as Record<string, unknown>;
  if (typeof teamwork.gives !== "string" || typeof teamwork.needs !== "string") return false;
  if (typeof report.decisionStyle !== "string" || report.decisionStyle.length > 1800) return false;
  if (!isStringArray(report.workEnvironments, 1, 8) || !isStringArray(report.development30Days, 1, 8)) return false;
  if (typeof report.confidenceNote !== "string" || report.confidenceNote.length > 1800) return false;
  return true;
}

function scorePayload(profile: ScoreProfile) {
  return {
    versions: profile.versions,
    responseQuality: profile.responseQuality,
    traits: profile.traits.map((trait) => ({
      code: trait.code,
      name: trait.name,
      definition: trait.definition,
      overuseRisk: trait.overuseRisk,
      standardScore: trait.standardScore,
      percentile: trait.percentile,
      rank: trait.rank,
      ci95: trait.ci95,
      exposure: trait.exposure,
      contradiction: trait.contradiction,
    })),
    domains: profile.domains,
  };
}

function systemPrompt() {
  return [
    "Ты — слой безопасной интерпретации ORBITA-30.",
    "На входе уже рассчитанный score JSON. Никогда не меняй числа, rank, percentile, CI, версии или флаги качества.",
    "Верни только JSON по заданной схеме, на русском языке.",
    "Используй вероятностный язык: может быть, вероятно, часто помогает. Не ставь диагнозы, не оценивай IQ, здоровье, личностную ценность и не обещай профессию, успех, найм или иной исход.",
    "Низкие значения не называй слабостью или дефектом. Объясняй наблюдаемые режимы действия, условия, overuse-риск и конкретные развивающие шаги.",
    "Топ-сильные стороны, trait и все числовые данные должны следовать входному JSON.",
  ].join(" ");
}

function outputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const pieces: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") pieces.push(text);
    }
  }
  return pieces.join("\n");
}

async function generateWithOpenAI(profile: ScoreProfile, apiKey: string): Promise<ReportJSON> {
  const runtimeEnv = getRuntimeEnv();
  const baseUrl = (runtimeEnv.OPENAI_BASE_URL ?? "https://api.openai.com").replace(/\/$/, "").replace(/\/v1$/, "");
  const controller = new AbortController();
  const timeout = Math.max(3000, Math.min(60000, Number(runtimeEnv.REPORT_TIMEOUT_MS ?? 20000)));
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: runtimeEnv.REPORT_MODEL ?? runtimeEnv.OPENAI_MODEL ?? "gpt-5",
        store: false,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt() }] },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify(scorePayload(profile)) }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "orbita_report",
            strict: true,
            schema: reportSchema,
          },
        },
      }),
    });
    if (!response.ok) {
      console.error("openai_report_request_failed", { status: response.status });
      throw new ReportProviderError("OPENAI_REQUEST_FAILED");
    }
    const payload = (await response.json()) as Record<string, unknown>;
    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText(payload));
    } catch {
      throw new ReportProviderError("OPENAI_INVALID_JSON");
    }
    if (!isReportJSON(parsed)) throw new ReportProviderError("OPENAI_SCHEMA_INVALID");
    return parsed;
  } catch (error) {
    if (error instanceof ReportProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ReportProviderError("OPENAI_TIMEOUT");
    throw new ReportProviderError("OPENAI_REQUEST_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

export async function generateReportContent(profile: ScoreProfile): Promise<GeneratedReport> {
  const runtimeEnv = getRuntimeEnv();
  const provider = (runtimeEnv.REPORT_PROVIDER ?? "approved-library").toLowerCase();
  if (provider === "openai") {
    if (!runtimeEnv.OPENAI_API_KEY) throw new ReportProviderError("OPENAI_API_KEY_MISSING");
    return { report: await generateWithOpenAI(profile, runtimeEnv.OPENAI_API_KEY), provider: "openai" };
  }
  return { report: buildReport(profile), provider: "approved-library" };
}
