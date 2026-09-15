import { ITEM_BANK, TRAITS, type Item, type TraitCode } from "@/lib/item-bank";
import type { ResponseMap } from "@/lib/assessment-engine";

export type ScoringFixtureRecipe =
  | { kind: "domain"; domainIndex: number }
  | { kind: "balanced" }
  | { kind: "contradictory-low-confidence" };

function qualityResponse(item: Extract<Item, { type: "quality" }>) {
  if (item.qualityKind === "attention") return item.expected ?? 5;
  if (item.qualityKind === "plausibility") return 2;
  return 4;
}

export function responsesForRecipe(recipe: ScoringFixtureRecipe): ResponseMap {
  const targetTraits = recipe.kind === "domain"
    ? new Set<TraitCode>(TRAITS.slice(recipe.domainIndex * 5, recipe.domainIndex * 5 + 5).map((trait) => trait.code))
    : new Set<TraitCode>();
  const responses: ResponseMap = {};

  for (const item of ITEM_BANK) {
    const number = Number(item.id.slice(1));
    if (recipe.kind === "contradictory-low-confidence" && number > 60) continue;
    if (item.type === "quality") {
      responses[item.id] = qualityResponse(item);
      continue;
    }
    if (item.type === "forced" || item.type === "adaptive_forced") {
      if (recipe.kind === "domain") {
        const left = targetTraits.has(item.leftTrait);
        const right = targetTraits.has(item.rightTrait);
        responses[item.id] = right && !left ? 2 : left && !right ? -2 : ((number + recipe.domainIndex) % 5) - 2;
      } else if (recipe.kind === "balanced") {
        responses[item.id] = ((number * 3) % 5) - 2;
      } else {
        responses[item.id] = number % 2 === 0 ? 2 : -2;
      }
      continue;
    }
    if (item.type === "likert" || item.type === "adaptive_likert") {
      if (recipe.kind === "domain") responses[item.id] = targetTraits.has(item.trait) ? 7 : 2 + (number % 3);
      else if (recipe.kind === "balanced") responses[item.id] = (number % 7) + 1;
      else responses[item.id] = item.type === "likert" && item.reverse ? 7 : 1;
    }
  }
  return responses;
}
