import type { OrbitaRuntimeEnv } from "@/db";
import type { AdaptiveContext } from "@/lib/orbita-v2-engine";
import {
  APPROVED_FALLBACK_BANK,
  CORE60_BANK,
  V2_ADAPTIVE_VERSION,
  V2_PROMPT_VERSION,
  type FallbackAdaptiveQuestion,
} from "@/lib/v2-item-bank";
import { MERCURY_ADAPTIVE_SYSTEM_PROMPT } from "@/lib/prompts/mercury-adaptive-v1";
import type { TraitCode } from "@/lib/item-bank";
import { readBoundedResponseJson } from "@/lib/provider-contract";

const MERCURY_PROVIDER = "inception-labs" as const;
const MERCURY_MODEL = "mercury-2.5" as const;
const MERCURY_API_BASE_URL = "https://api.inceptionlabs.ai" as const;
const ALLOWED_ADAPTIVE_REASON_CODES = [
  "HIGH_UNCERTAINTY",
  "TOP5_BOUNDARY",
  "TOP10_BOUNDARY",
  "CONTRADICTION",
  "UNDERCOVERAGE",
  "PAIR_DISCRIMINATION",
  "HIGH_INFORMATION",
] as const;

type AdaptiveReasonCode = (typeof ALLOWED_ADAPTIVE_REASON_CODES)[number];
type GeneratedAdaptiveFormat = "forced_choice" | "likert";

export type GeneratedAdaptiveQuestion = {
  questionId: `AI-${string}` | `FB-${string}`;
  format: GeneratedAdaptiveFormat;
  targetTraits: TraitCode[];
  reasonCode: AdaptiveReasonCode;
  prompt: string;
  options: Array<{ id: "A" | "B"; text: string }>;
  semanticIntent: string;
  semanticCluster: string;
  confidence: number;
  provider: typeof MERCURY_PROVIDER | "approved-fallback";
  model: string | null;
  providerRequestId?: string | null;
  promptVersion: typeof V2_PROMPT_VERSION;
  adaptiveVersion: typeof V2_ADAPTIVE_VERSION;
  validationStatus: "accepted";
};

export type AdaptiveProviderRun = {
  provider: typeof MERCURY_PROVIDER | "approved-fallback";
  modelId: string | null;
  promptVersion: typeof V2_PROMPT_VERSION;
  adaptiveVersion: typeof V2_ADAPTIVE_VERSION;
  providerRequestId: string | null;
  inputHash: string;
  outputHash: string;
  latencyMs: number;
  validationResult: "passed" | "fallback";
  fallbackReason: string | null;
  attemptCount: number;
  promptTokens: number | null;
  outputTokens: number | null;
};

export type GeneratedAdaptiveSet = {
  questions: GeneratedAdaptiveQuestion[];
  run: AdaptiveProviderRun;
  fallbackUsed: boolean;
};

interface AdaptiveQuestionProvider {
  generateQuestions(context: AdaptiveContext): Promise<GeneratedAdaptiveSet>;
}

const MERCURY_RESPONSE_SCHEMA = {
  name: "orbita_adaptive_questions",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        minItems: 10,
        maxItems: 15,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            questionId: { type: "string", pattern: "^AI-[0-9]{2}$" },
            format: { type: "string", enum: ["forced_choice", "likert"] },
            targetTraits: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } },
            reasonCode: { type: "string", enum: ALLOWED_ADAPTIVE_REASON_CODES },
            prompt: { type: "string" },
            options: {
              type: "array",
              minItems: 0,
              maxItems: 2,
              items: {
                type: "object",
                additionalProperties: false,
                properties: { id: { type: "string", enum: ["A", "B"] }, text: { type: "string" } },
                required: ["id", "text"],
              },
            },
            semanticIntent: { type: "string" },
            semanticCluster: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["questionId", "format", "targetTraits", "reasonCode", "prompt", "options", "semanticIntent", "semanticCluster", "confidence"],
        },
      },
    },
    required: ["questions"],
  },
} as const;

const normalizeText = (value: string) => value.toLocaleLowerCase("ru-RU")
  .replaceAll("ё", "е")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .split(/\s+/)
  .filter((word) => word.length > 2 || /^\d+$/u.test(word))
  .join(" ");

const tokens = (value: string) => new Set(normalizeText(value).split(" ").filter(Boolean));

function textFor(question: { prompt: string; options?: Array<{ text: string }> }) {
  return [question.prompt, ...(question.options ?? []).map((option) => option.text)].join(" ");
}

function sha256(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((bytes) =>
    [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
}

function targetPair(question: { targetTraits: TraitCode[] }) {
  return [...question.targetTraits].sort().join("|");
}

function containsSensitiveWording(text: string) {
  return /(фио|имя|фамили|email|почт|телефон|адрес|паспорт|иин|доход|зарплат|деньг|здоров|медицин|диагноз|лечени|религи|полит|сексуал|ориентац|национальн|раса)/iu.test(text);
}

function containsLeadingWording(text: string) {
  return /(правильн|лучший|хороший|плохой|должн|очевидно|всегда|никогда|нормальн|успешн)/iu.test(text);
}

function isDoubleBarrelled(prompt: string) {
  const conjunctions = (prompt.match(/\bи\b/giu) ?? []).length;
  return conjunctions > 2 || /\b(и одновременно|а также|плюс к этому)\b/iu.test(prompt);
}

function knownTraitSet(context: AdaptiveContext) {
  return new Set(context.preliminaryTraits.map((trait) => trait.traitId));
}

export function validateGeneratedAdaptiveQuestions(
  rawQuestions: unknown,
  context: AdaptiveContext,
  expectedCount = adaptiveCountForContext(context),
  existingQuestions: readonly GeneratedAdaptiveQuestion[] = [],
) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length !== expectedCount || rawQuestions.length < 10 || rawQuestions.length > 15) {
    throw new Error("ADAPTIVE_GENERATED_COUNT_INVALID");
  }
  const knownTraits = knownTraitSet(context);
  const seenIds = new Set<string>();
  const seenClusters = new Set(existingQuestions.map((question) => question.semanticCluster));
  const seenNormalized = new Set<string>();
  const seenTargetIntents = new Set<string>();
  const coreTexts = CORE60_BANK.map((item) => normalizeText([item.prompt, "optionA" in item ? item.optionA : "", "optionB" in item ? item.optionB : ""].join(" ")));
  const questions: GeneratedAdaptiveQuestion[] = [];
  for (const candidate of rawQuestions) {
    if (!candidate || typeof candidate !== "object") throw new Error("ADAPTIVE_GENERATED_SCHEMA_INVALID");
    const item = candidate as Record<string, unknown>;
    const allowedKeys = new Set(["questionId", "format", "targetTraits", "reasonCode", "prompt", "options", "semanticIntent", "semanticCluster", "confidence"]);
    if (Object.keys(item).some((key) => !allowedKeys.has(key))) throw new Error("ADAPTIVE_GENERATED_SCHEMA_INVALID");
    const questionId = item.questionId;
    const format = item.format;
    const targetTraits = item.targetTraits;
    const reasonCode = item.reasonCode;
    const prompt = item.prompt;
    const options = item.options;
    const semanticIntent = item.semanticIntent;
    const semanticCluster = item.semanticCluster;
    const confidence = item.confidence;
    if (typeof questionId !== "string" || !/^AI-\d{2}$/.test(questionId) || seenIds.has(questionId)) throw new Error("ADAPTIVE_GENERATED_ID_INVALID");
    if (format !== "forced_choice" && format !== "likert") throw new Error("ADAPTIVE_GENERATED_FORMAT_INVALID");
    if (!Array.isArray(targetTraits) || targetTraits.length !== (format === "forced_choice" ? 2 : 1) || targetTraits.some((trait) => typeof trait !== "string" || !knownTraits.has(trait as TraitCode))) throw new Error("ADAPTIVE_GENERATED_TRAIT_INVALID");
    if (!ALLOWED_ADAPTIVE_REASON_CODES.includes(reasonCode as AdaptiveReasonCode)) throw new Error("ADAPTIVE_GENERATED_REASON_INVALID");
    if (typeof prompt !== "string" || prompt.trim().length < 20 || prompt.trim().length > 500) throw new Error("ADAPTIVE_GENERATED_PROMPT_INVALID");
    if (!Array.isArray(options) || (format === "forced_choice" && options.length !== 2) || (format === "likert" && options.length !== 0)) throw new Error("ADAPTIVE_GENERATED_OPTIONS_INVALID");
    const parsedOptions: Array<{ id: "A" | "B"; text: string }> = [];
    for (const option of options) {
      if (!option || typeof option !== "object") throw new Error("ADAPTIVE_GENERATED_OPTIONS_INVALID");
      const entry = option as Record<string, unknown>;
      if ((entry.id !== "A" && entry.id !== "B") || typeof entry.text !== "string" || entry.text.trim().length < 5 || entry.text.length > 220) throw new Error("ADAPTIVE_GENERATED_OPTION_INVALID");
      parsedOptions.push({ id: entry.id, text: entry.text.trim() });
    }
    if (format === "forced_choice" && new Set(parsedOptions.map((option) => option.id)).size !== 2) throw new Error("ADAPTIVE_GENERATED_OPTION_IDS_INVALID");
    if (typeof semanticIntent !== "string" || semanticIntent.trim().length < 8 || semanticIntent.length > 240) throw new Error("ADAPTIVE_GENERATED_INTENT_INVALID");
    if (typeof semanticCluster !== "string" || semanticCluster.trim().length < 3 || semanticCluster.length > 120 || seenClusters.has(semanticCluster)) throw new Error("ADAPTIVE_GENERATED_CLUSTER_INVALID");
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("ADAPTIVE_GENERATED_CONFIDENCE_INVALID");
    const targetIntent = `${targetPair({ targetTraits: targetTraits as TraitCode[] })}:${normalizeText(semanticIntent)}`;
    if (seenTargetIntents.has(targetIntent)) throw new Error("ADAPTIVE_GENERATED_SEMANTIC_DUPLICATE");
    const combined = textFor({ prompt, options: parsedOptions });
    if (containsSensitiveWording(combined) || containsLeadingWording(combined) || isDoubleBarrelled(prompt)) throw new Error("ADAPTIVE_GENERATED_SAFETY_INVALID");
    const normalized = normalizeText(combined);
    if (!normalized || seenNormalized.has(normalized)) throw new Error("ADAPTIVE_GENERATED_DUPLICATE");
    const candidateTokens = tokens(combined);
    if (coreTexts.some((coreText) => {
      const coreTokens = tokens(coreText);
      const overlap = [...candidateTokens].filter((token) => coreTokens.has(token)).length / Math.max(1, Math.min(candidateTokens.size, coreTokens.size));
      return normalizeText(coreText) === normalized || overlap >= 0.8;
    })) throw new Error("ADAPTIVE_GENERATED_SEMANTIC_DUPLICATE");
    seenIds.add(questionId);
    seenClusters.add(semanticCluster);
    seenNormalized.add(normalized);
    seenTargetIntents.add(targetIntent);
    questions.push({
      questionId: questionId as `AI-${string}`,
      format,
      targetTraits: targetTraits as TraitCode[],
      reasonCode: reasonCode as AdaptiveReasonCode,
      prompt: prompt.trim(),
      options: parsedOptions,
      semanticIntent: semanticIntent.trim(),
      semanticCluster: semanticCluster.trim(),
      confidence,
      provider: MERCURY_PROVIDER,
      model: MERCURY_MODEL,
      promptVersion: V2_PROMPT_VERSION,
      adaptiveVersion: V2_ADAPTIVE_VERSION,
      validationStatus: "accepted",
    });
  }
  return questions;
}

function priorityForTrait(context: AdaptiveContext, code: TraitCode) {
  const trait = context.preliminaryTraits.find((candidate) => candidate.traitId === code);
  if (!trait) return 0;
  const uncertainty = Math.min(1, Math.max(0, (trait.uncertainty - 0.22) / 0.21));
  const boundary = Math.max(context.top5Boundary.includes(code) ? 1 : 0, context.top10Boundary.includes(code) ? 0.8 : 0);
  const contradiction = Math.min(1, trait.contradiction);
  const undercoverage = trait.exposure < 3 ? 1 : 0;
  return 0.45 * uncertainty + 0.25 * boundary + 0.2 * contradiction + 0.1 * undercoverage;
}

export function adaptiveCountForContext(context: AdaptiveContext) {
  const meanUncertainty = context.preliminaryTraits.reduce((sum, trait) => sum + trait.uncertainty, 0) / Math.max(1, context.preliminaryTraits.length);
  if (meanUncertainty >= 0.37 || context.contradictions.length >= 2) return 15;
  if (meanUncertainty >= 0.31 || context.contradictions.length === 1) return 12;
  return 10;
}

function fallbackQuestions(context: AdaptiveContext, count: number) {
  const exposure = new Map<TraitCode, number>();
  const selected: FallbackAdaptiveQuestion[] = [];
  const ranked = [...APPROVED_FALLBACK_BANK].sort((left, right) => {
    const leftScore = Math.max(...left.targetTraits.map((trait) => priorityForTrait(context, trait))) + (left.reasonCode === "PAIR_DISCRIMINATION" ? 0.08 : 0);
    const rightScore = Math.max(...right.targetTraits.map((trait) => priorityForTrait(context, trait))) + (right.reasonCode === "PAIR_DISCRIMINATION" ? 0.08 : 0);
    return rightScore - leftScore || left.questionId.localeCompare(right.questionId);
  });
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (item.targetTraits.some((trait) => (exposure.get(trait) ?? 0) >= 3)) continue;
    selected.push(item);
    for (const trait of item.targetTraits) exposure.set(trait, (exposure.get(trait) ?? 0) + 1);
  }
  if (selected.length < count) throw new Error("ADAPTIVE_FALLBACK_POOL_EXHAUSTED");
  return selected.map((item) => ({ ...item }));
}

function providerConfig(env: Partial<OrbitaRuntimeEnv> = {}) {
  const timeoutMs = Math.max(3000, Math.min(60000, Number(env.MERCURY_TIMEOUT_MS ?? 12000)));
  const maxAttempts = Math.max(1, Math.min(2, Number(env.MERCURY_MAX_RETRIES ?? 2)));
  return {
    enabled: String(env.AI_ENABLED ?? "false").trim().toLowerCase() === "true",
    provider: (env.ADAPTIVE_PROVIDER ?? "fallback").trim().toLowerCase(),
    apiKey: env.INCEPTION_API_KEY?.trim(),
    model: env.MERCURY_MODEL?.trim() || MERCURY_MODEL,
    timeoutMs,
    maxAttempts,
  };
}

async function parseProviderJson(response: Response) {
  const payload = await readBoundedResponseJson(response, 128 * 1024) as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  const message = first && typeof first === "object" ? (first as Record<string, unknown>).message : null;
  const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : null;
  if (typeof content !== "string") throw new Error("MERCURY_CONTENT_MISSING");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return { value: JSON.parse(cleaned) as unknown, requestId: typeof payload.id === "string" ? payload.id : null, usage: payload.usage };
}

function usageValues(usage: unknown) {
  if (!usage || typeof usage !== "object") return { prompt: null, output: null };
  const row = usage as Record<string, unknown>;
  const prompt = Number(row.prompt_tokens ?? row.input_tokens);
  const output = Number(row.completion_tokens ?? row.output_tokens);
  return { prompt: Number.isFinite(prompt) ? prompt : null, output: Number.isFinite(output) ? output : null };
}

async function callMercury(context: AdaptiveContext, env: Partial<OrbitaRuntimeEnv>) {
  const config = providerConfig(env);
  const input = JSON.stringify({ ...context, targetCount: adaptiveCountForContext(context) });
  const inputHash = await sha256(input);
  let lastError = "MERCURY_UNKNOWN_FAILURE";
  let requestId: string | null = null;
  let usage: { prompt: number | null; output: number | null } = { prompt: null, output: null };
  let validationFeedback: string | null = null;
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(`${MERCURY_API_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: MERCURY_ADAPTIVE_SYSTEM_PROMPT },
            {
              role: "user",
              content: validationFeedback
                ? `${input}\n\nPrevious attempt failed server validation with code ${validationFeedback}. Return a fresh set that fixes that validation boundary.`
                : input,
            },
          ],
          response_format: { type: "json_schema", json_schema: MERCURY_RESPONSE_SCHEMA },
          max_completion_tokens: 8192,
          reasoning_effort: "low",
          stream: false,
        }),
      });
      if (!response.ok) {
        lastError = response.status === 429 ? "RATE_LIMITED" : `MERCURY_HTTP_${response.status}`;
        if (attempt < config.maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
          continue;
        }
        throw new Error(lastError);
      }
      const parsed = await parseProviderJson(response);
      requestId = parsed.requestId;
      usage = usageValues(parsed.usage);
      const questions = validateGeneratedAdaptiveQuestions((parsed.value as { questions?: unknown })?.questions, context);
      return {
        questions,
        run: {
          provider: MERCURY_PROVIDER,
          modelId: config.model,
          promptVersion: V2_PROMPT_VERSION,
          adaptiveVersion: V2_ADAPTIVE_VERSION,
          providerRequestId: requestId,
          inputHash,
          outputHash: await sha256(JSON.stringify(questions)),
          latencyMs: Date.now() - startedAt,
          validationResult: "passed" as const,
          fallbackReason: null,
          attemptCount: attempt,
          promptTokens: usage.prompt,
          outputTokens: usage.output,
        },
        fallbackUsed: false,
      } satisfies GeneratedAdaptiveSet;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "MERCURY_UNKNOWN_FAILURE";
      validationFeedback = lastError.slice(0, 120);
      if (attempt >= config.maxAttempts) break;
    } finally {
      clearTimeout(timer);
    }
  }
  const failure = new Error(lastError) as Error & { attemptCount?: number };
  failure.attemptCount = config.maxAttempts;
  throw failure;
}

export class MercuryAdaptiveProvider implements AdaptiveQuestionProvider {
  constructor(private readonly env: Partial<OrbitaRuntimeEnv> = {}) {}

  async generateQuestions(context: AdaptiveContext): Promise<GeneratedAdaptiveSet> {
    const count = adaptiveCountForContext(context);
    const fallback = async (reason: string) => {
      const inputHash = await sha256(JSON.stringify(context));
      const questions = fallbackQuestions(context, count).map((question) => ({ ...question }));
      return {
        questions,
        run: {
          provider: "approved-fallback" as const,
          modelId: null,
          promptVersion: V2_PROMPT_VERSION,
          adaptiveVersion: V2_ADAPTIVE_VERSION,
          providerRequestId: null,
          inputHash,
          outputHash: await sha256(JSON.stringify(questions)),
          latencyMs: 0,
          validationResult: "fallback" as const,
          fallbackReason: reason,
          attemptCount: 0,
          promptTokens: null,
          outputTokens: null,
        },
        fallbackUsed: true,
      } satisfies GeneratedAdaptiveSet;
    };
    const config = providerConfig(this.env);
    if (!config.enabled || config.provider !== "mercury" || !config.apiKey) return fallback(!config.apiKey ? "secret_missing" : "provider_disabled");
    try {
      return await callMercury(context, this.env);
    } catch (error) {
      const attempts = error && typeof error === "object" && "attemptCount" in error && typeof (error as { attemptCount?: unknown }).attemptCount === "number"
        ? (error as { attemptCount: number }).attemptCount
        : 0;
      const result = await fallback(error instanceof Error ? error.message.slice(0, 80) : "provider_failed");
      result.run.attemptCount = attempts;
      return result;
    }
  }
}

export function createAdaptiveQuestionProvider(env: Partial<OrbitaRuntimeEnv> = {}) {
  return new MercuryAdaptiveProvider(env);
}

export function fallbackAdaptiveQuestions(context: AdaptiveContext, count = adaptiveCountForContext(context)) {
  return fallbackQuestions(context, Math.min(15, Math.max(10, count))).map((question) => ({ ...question }));
}

export function generatedQuestionToResponseItem(question: GeneratedAdaptiveQuestion) {
  return {
    questionId: question.questionId,
    format: question.format,
    targetTraits: question.targetTraits,
    reverse: false,
  } as const;
}
