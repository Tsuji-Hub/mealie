import type { Nutrition } from "~/lib/api/types/recipe";

/**
 * Marks a recipe's nutrition as AI-estimated rather than sourced. Must match
 * NUTRITION_ESTIMATED_KEY in mealie/schema/recipe/recipe_nutrition_estimate.py — the backend
 * writes it, this reads it.
 *
 * Why it exists: the FDL recipes carry true macros from the source and are what MacroFactor
 * consumes; the TikTok imports carry guesses. They sit in the same grid and the same sort. If
 * an estimated 450 and a real 106 both render as a plain number, the ability to know which
 * ones to trust is gone — and that trust is the only reason the FDL data is worth having.
 */
export const NUTRITION_ESTIMATED_KEY = "nutrition_estimated";

/** Extras are stored as strings, so the flag is the string "true", not a boolean. */
export function isNutritionEstimated(extras?: Record<string, unknown> | null): boolean {
  return String(extras?.[NUTRITION_ESTIMATED_KEY] ?? "") === "true";
}

/** Strip the flag, leaving every other extra (servingUnit and friends) untouched. */
export function withoutEstimateFlag(extras?: Record<string, unknown> | null): Record<string, unknown> {
  const { [NUTRITION_ESTIMATED_KEY]: _dropped, ...rest } = extras || {};
  return rest;
}

/** "450" -> "~450". The tilde is the only thing separating a guess from a sourced macro. */
export function markEstimate(value: string, estimated: boolean): string {
  return estimated && value ? `~${value}` : value;
}

/**
 * Did the user actually change a nutrition value?
 *
 * Compares numerically on purpose. The editor round-trips values through v-number-input, so a
 * stored "450" can come back as 450 having been touched by nobody. A plain !== would read that
 * as a hand-edit and silently clear the estimated flag just for opening the edit form — the
 * number would stop being marked as a guess without anyone editing it.
 */
export function nutritionChanged(before?: Nutrition | null, after?: Nutrition | null): boolean {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (!sameValue(before?.[key as keyof Nutrition], after?.[key as keyof Nutrition])) {
      return true;
    }
  }
  return false;
}

function sameValue(a: unknown, b: unknown): boolean {
  const left = toNumberOrNull(a);
  const right = toNumberOrNull(b);

  // Both unparseable: fall back to comparing the raw text, so "approx" -> "approx." still counts.
  if (left === null && right === null) {
    return String(a ?? "").trim() === String(b ?? "").trim();
  }
  return left === right;
}

function toNumberOrNull(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}
