import type { Nutrition } from "~/lib/api/types/recipe";

export interface MacroCell {
  key: string;
  value: string;
  unit: string;
  label: string;
}

/** Format a nutrition string: "106.0" -> "106", "10.5" -> "10.5", null -> "". */
function fmt(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

/** The four macro-bar cells (kcal/protein/carbs/fat), empty values dropped. */
export function getMacroCells(nutrition?: Nutrition | null): MacroCell[] {
  const n: Nutrition = nutrition || {};
  return [
    { key: "calories", value: fmt(n.calories), unit: "", label: "kcal" },
    { key: "protein", value: fmt(n.proteinContent), unit: "g", label: "protein" },
    { key: "carbs", value: fmt(n.carbohydrateContent), unit: "g", label: "carbs" },
    { key: "fat", value: fmt(n.fatContent), unit: "g", label: "fat" },
  ].filter(cell => cell.value !== "");
}

export function hasMacros(nutrition?: Nutrition | null): boolean {
  return getMacroCells(nutrition).length > 0;
}
