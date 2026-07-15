import { describe, expect, test } from "vitest";
import {
  isNutritionEstimated,
  markEstimate,
  nutritionChanged,
  withoutEstimateFlag,
} from "./use-nutrition-estimate";
import type { Nutrition } from "~/lib/api/types/recipe";

describe("isNutritionEstimated", () => {
  test("reads the flag the backend writes", () => {
    expect(isNutritionEstimated({ nutrition_estimated: "true" })).toBe(true);
  });

  test("an FDL recipe with no flag is not estimated", () => {
    expect(isNutritionEstimated({})).toBe(false);
    expect(isNutritionEstimated(null)).toBe(false);
    expect(isNutritionEstimated(undefined)).toBe(false);
  });

  test("other extras do not turn it on", () => {
    expect(isNutritionEstimated({ servingUnit: "Cookie" })).toBe(false);
  });

  test("extras are strings, so only the string true counts", () => {
    expect(isNutritionEstimated({ nutrition_estimated: "false" })).toBe(false);
    expect(isNutritionEstimated({ nutrition_estimated: "" })).toBe(false);
  });
});

describe("withoutEstimateFlag", () => {
  test("drops the flag and keeps every other extra", () => {
    expect(withoutEstimateFlag({ nutrition_estimated: "true", servingUnit: "Cookie" })).toEqual({
      servingUnit: "Cookie",
    });
  });

  test("is safe when there is no flag or no extras", () => {
    expect(withoutEstimateFlag({ servingUnit: "Cookie" })).toEqual({ servingUnit: "Cookie" });
    expect(withoutEstimateFlag(null)).toEqual({});
  });
});

describe("markEstimate", () => {
  test("marks an estimate", () => {
    expect(markEstimate("450", true)).toBe("~450");
  });

  test("leaves a sourced macro alone — an FDL number must never grow a tilde", () => {
    expect(markEstimate("359", false)).toBe("359");
  });

  test("does not produce a bare tilde when there is no value", () => {
    expect(markEstimate("", true)).toBe("");
  });
});

describe("nutritionChanged", () => {
  /**
   * THE REGRESSION CASE. v-number-input round-trips the stored string "450" back as the number
   * 450 without the user touching anything. If that reads as an edit, merely opening the edit
   * form clears the estimated flag and the ~ silently disappears from a number nobody verified.
   */
  test("REGRESSION: a string round-tripped to a number is not an edit", () => {
    expect(nutritionChanged({ calories: "450" }, { calories: 450 as unknown as string })).toBe(false);
  });

  test("trailing zeros and whitespace are not an edit", () => {
    expect(nutritionChanged({ calories: "450" }, { calories: "450.0" })).toBe(false);
    expect(nutritionChanged({ calories: "450" }, { calories: " 450 " })).toBe(false);
  });

  test("identical objects are not an edit", () => {
    const n: Nutrition = { calories: "450", proteinContent: "20" };
    expect(nutritionChanged(n, { ...n })).toBe(false);
  });

  test("a real edit is an edit", () => {
    expect(nutritionChanged({ calories: "450" }, { calories: "460" })).toBe(true);
  });

  test("clearing a value is an edit", () => {
    expect(nutritionChanged({ calories: "450" }, { calories: "" })).toBe(true);
    expect(nutritionChanged({ calories: "450" }, { calories: null })).toBe(true);
  });

  test("filling in a previously empty value is an edit", () => {
    expect(nutritionChanged({ calories: null }, { calories: "450" })).toBe(true);
  });

  test("editing a non-macro field still counts — it is his number now", () => {
    expect(nutritionChanged({ sodiumContent: "5" }, { sodiumContent: "6" })).toBe(true);
  });

  test("empty and null are the same nothing", () => {
    expect(nutritionChanged({ calories: null }, { calories: "" })).toBe(false);
    expect(nutritionChanged({}, {})).toBe(false);
    expect(nutritionChanged(null, null)).toBe(false);
  });

  test("non-numeric text is compared as text", () => {
    expect(nutritionChanged({ calories: "approx" }, { calories: "approx" })).toBe(false);
    expect(nutritionChanged({ calories: "approx" }, { calories: "approximately" })).toBe(true);
  });
});
