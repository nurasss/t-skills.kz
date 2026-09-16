import { getRuntimeEnv } from "@/db";
import { aiEnabled } from "@/lib/runtime-config";
import {
  selectAdaptiveItems,
  validateAdaptiveSelection,
  ADAPTIVE_REASON_CODES,
  type AdaptiveSelection,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { ITEM_BANK, type Item } from "@/lib/item-bank";
import { selectionFromPayload } from "@/lib/adaptive-contract";
import { parseStrictJsonProviderOutput, providerFailureReason } from "@/lib/provider-contract";

export type AdaptiveRunRecord = {
  selectorVersion: string;
  provider: "openai" | "approved-library" | "inception-labs" | "approved-fallback";
  modelId: string | null;
  inputHash: string;
  outputHash: string;
  latencyMs: number;
  validationResult: "passed" | "fallback";
  fallbackReason: string | null;
  promptVersion?: string;
  adaptiveVersion?: string;
  providerRequestId?: string | null;
  attemptCount?: number;
  promptTokens?: number | null;
  outputTokens?: number | null;
  generatedCount?: number;
};

export type AdaptiveDecision = {
  selection: AdaptiveSelection;
  run: AdaptiveRunRecord;
};

export const ADAPTIVE_SELECTOR_VERSION = "selector-0.3";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function targetTraits(item: Item) {
  if (item.type === "adaptive_likert") return [item.trait];
  if (item.type === "adaptive_forced") return [item.leftTrait, item.rightTrait];
  return [];
}

function semanticClusterId(item: Item) {
  const targets = targetTraits(item).slice().sort().join("-");
  return item.type === "adaptive_forced" ? `pair-${targets}` : `direct-${targets}`;
}

function expectedInformation(item: Item) {
  return item.type === "adaptive_forced" ? 0.84 : 0.71;
}

export function buildAdaptivePayload(profile: ScoreProfile, answeredItemIds: string[], targetCount: number) {
  const priorities = profile.traits.map((trait) => ({
    code: trait.code,
    theta: trait.theta,
    se: trait.se,
    rank: trait.rank,
    top5_boundary: round(clamp(1 - Math.abs(trait.rank - 5) / 8, 0, 1)),
    top10_boundary: round(clamp(1 - Math.abs(trait.rank - 10) / 12, 0, 1)),
    contradiction: trait.contradiction,
    coverage: trait.exposure,
  }));
  const adaptivePool = ITEM_BANK
    .filter((item) => (item.type === "adaptive_likert" || item.type === "adaptive_forced") && !answeredItemIds.includes(item.id))
    .map((item) => ({
      id: item.id,
      targets: targetTraits(item),
      type: item.type,
      expected_information: expectedInformation(item),
      semantic_cluster_id: semanticClusterId(item),
    }));
  return {
    assessment_version: profile.versions.assessment,
    target_count: targetCount,
    selector_config: { min: 10, max: 15, max_per_trait: 3 },
    traits: priorities,
    answered_item_ids: answeredItemIds,
    adaptive_pool: adaptivePool,
  };
}

async function chooseWithOpenAI(
  profile: ScoreProfile,
  answeredItemIds: string[],
  targetCount: number,
  apiKey: string,
  modelId: string,
) {
  const runtimeEnv = getRuntimeEnv();
  const baseUrl = (runtimeEnv.OPENAI_BASE_URL ?? "https://api.openai.com").replace(/\/$/, "").replace(/\/v1$/, "");
  const payload = buildAdaptivePayload(profile, answeredItemIds, targetCount);
  const controller = new AbortController();
  const timeout = Math.max(3000, Math.min(60000, Number(runtimeEnv.ADAPTIVE_TIMEOUT_MS ?? 10000)));
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelId,
        store: false,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: [
              `Ты — безопасный Adaptive Item Selector ORBITA-30, prompt ${ADAPTIVE_SELECTOR_VERSION}.`,
              "Выбирай только item_id из adaptive_pool; не меняй тексты, не создавай новые items, не считай score и не делай интерпретаций.",
              "Цель приоритета: 0.45×нормализованный SE + 0.25×близость к границе Top 5/Top 10 + 0.20×contradiction + 0.10×undercoverage.",
              "Ожидаемая информация: используй expected_information и предпочитай более информативные items после учёта приоритета; для items у границ Top 5/Top 10 отдавай преимущество при сопоставимом приоритете.",
              "Верни от 10 до 15 items и ровно target_count; максимум 3 item на trait, не выбирай answered_item_ids, не дублируй semantic_cluster_id.",
              "Reason codes обязательны для каждого выбранного item и могут содержать только HIGH_UNCERTAINTY, TOP5_BOUNDARY, TOP10_BOUNDARY, CONTRADICTION, UNDERCOVERAGE, PAIR_DISCRIMINATION, HIGH_INFORMATION.",
              "Верни только JSON по схеме.",
            ].join(" ") }],
          },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "orbita_adaptive_selection",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                selected_item_ids: { type: "array", minItems: 10, maxItems: 15, items: { type: "string" } },
                reason_codes: {
                  type: "array",
                  maxItems: 15,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      item_id: { type: "string" },
                      reasons: { type: "array", minItems: 1, items: { type: "string", enum: ADAPTIVE_REASON_CODES }, maxItems: 8 },
                    },
                    required: ["item_id", "reasons"],
                  },
                },
                target_count: { type: "integer", minimum: 10, maximum: 15 },
              },
              required: ["selected_item_ids", "reason_codes", "target_count"],
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`ADAPTIVE_OPENAI_HTTP_${response.status}`);
    const parsed = parseStrictJsonProviderOutput(await response.json() as Record<string, unknown>);
    if (!parsed.ok) throw new Error(`ADAPTIVE_${parsed.reason}`);
    return selectionFromPayload(parsed.value);
  } finally {
    clearTimeout(timer);
  }
}

async function fallbackDecision(
  profile: ScoreProfile,
  answeredItemIds: string[],
  targetCount: number,
  inputHash: string,
  startedAt: number,
  reason: string,
): Promise<AdaptiveDecision> {
  const selection = selectAdaptiveItems(profile, answeredItemIds, targetCount);
  return {
    selection,
    run: {
      selectorVersion: ADAPTIVE_SELECTOR_VERSION,
      provider: "approved-library",
      modelId: null,
      inputHash,
      outputHash: await sha256(JSON.stringify(selection)),
      latencyMs: Date.now() - startedAt,
      validationResult: reason === "provider_disabled" ? "passed" : "fallback",
      fallbackReason: reason === "provider_disabled" ? null : reason,
    },
  };
}

export async function selectAdaptiveForProfile(
  profile: ScoreProfile,
  answeredItemIds: string[] = [],
  requestedCount = 12,
): Promise<AdaptiveDecision> {
  const startedAt = Date.now();
  const targetCount = clamp(Math.round(requestedCount), 10, 15);
  const payload = buildAdaptivePayload(profile, answeredItemIds, targetCount);
  const inputHash = await sha256(JSON.stringify(payload));
  const runtimeEnv = getRuntimeEnv();
  const provider = (runtimeEnv.ADAPTIVE_PROVIDER ?? "approved-library").toLowerCase();
  if (!aiEnabled(runtimeEnv) || provider !== "openai" || !runtimeEnv.OPENAI_API_KEY) {
    return fallbackDecision(profile, answeredItemIds, targetCount, inputHash, startedAt, "provider_disabled");
  }

  const modelId = runtimeEnv.ADAPTIVE_MODEL ?? runtimeEnv.OPENAI_MODEL ?? runtimeEnv.REPORT_MODEL ?? "gpt-5";
  try {
    const raw = await chooseWithOpenAI(profile, answeredItemIds, targetCount, runtimeEnv.OPENAI_API_KEY, modelId);
    const clusters = Object.fromEntries(
      payload.adaptive_pool.map((item) => [item.id, item.semantic_cluster_id]),
    );
    if (raw.targetCount !== targetCount || raw.selectedItemIds.length !== targetCount || Object.keys(raw.reasonCodes).length !== raw.selectedItemIds.length || !validateAdaptiveSelection(raw.selectedItemIds, answeredItemIds, 3, clusters, raw.reasonCodes)) {
      throw new Error("ADAPTIVE_VALIDATION_FAILED");
    }
    const selection: AdaptiveSelection = {
      selectedItemIds: raw.selectedItemIds,
      reasonCodes: raw.reasonCodes,
      targetCount,
      mode: "ai-openai",
      validation: "passed",
    };
    return {
      selection,
      run: {
        selectorVersion: ADAPTIVE_SELECTOR_VERSION,
        provider: "openai",
        modelId,
        inputHash,
        outputHash: await sha256(JSON.stringify(raw)),
        latencyMs: Date.now() - startedAt,
        validationResult: "passed",
        fallbackReason: null,
      },
    };
  } catch (error) {
    const reason = providerFailureReason(error, "ADAPTIVE");
    console.error("adaptive_provider_failed", { reason });
    return fallbackDecision(profile, answeredItemIds, targetCount, inputHash, startedAt, reason);
  }
}
