import { describe, expect, test } from "vitest";
import { getMacroCells, hasMacros } from "./use-macro-summary";

/** Values here are real: 183/25/15/3.5 is the live Oreo Protein Cheesecake, a true FDL macro. */
describe("getMacroCells", () => {
  const nutrition = {
    calories: "183",
    proteinContent: "25",
    carbohydrateContent: "15",
    fatContent: "3.5",
  };

  test("renders the four macros in order", () => {
    expect(getMacroCells(nutrition).map(c => [c.key, c.value, c.unit])).toEqual([
      ["calories", "183", ""],
      ["protein", "25", "g"],
      ["carbs", "15", "g"],
      ["fat", "3.5", "g"],
    ]);
  });

  test("formats away trailing zeros", () => {
    expect(getMacroCells({ calories: "106.0" })[0]!.value).toBe("106");
  });

  test("drops empty values rather than showing a blank cell", () => {
    expect(getMacroCells({ calories: "183", proteinContent: null }).map(c => c.key)).toEqual(["calories"]);
    expect(getMacroCells(null)).toEqual([]);
  });

  /**
   * The whole point of the feature. An estimated 450 and a true FDL 359 render in the same
   * grid, same sort, same card; the tilde is the only thing that tells them apart.
   */
  test("marks an estimate on the calories cell", () => {
    expect(getMacroCells(nutrition, true)[0]!.value).toBe("~183");
  });

  test("a sourced macro is never marked — this is the FDL guarantee", () => {
    expect(getMacroCells(nutrition, false)[0]!.value).toBe("183");
    expect(getMacroCells(nutrition).map(c => c.value).join()).not.toContain("~");
  });

  test("only calories carries the mark; four tildes would be noise", () => {
    expect(getMacroCells(nutrition, true).map(c => c.value)).toEqual(["~183", "25", "15", "3.5"]);
  });

  test("estimated with no calories does not emit a bare tilde", () => {
    expect(getMacroCells({ proteinContent: "25" }, true).map(c => c.value)).toEqual(["25"]);
  });
});

describe("hasMacros", () => {
  /** Gates the Estimate button. Must agree with has_macros() in nutrition_estimate_service.py. */
  test("true when any macro exists, so the button hides and FDL data is untouchable", () => {
    expect(hasMacros({ calories: "183" })).toBe(true);
    expect(hasMacros({ proteinContent: "25" })).toBe(true);
  });

  test("false when there is nothing to lose", () => {
    expect(hasMacros({})).toBe(false);
    expect(hasMacros(null)).toBe(false);
    expect(hasMacros({ calories: null, proteinContent: "" })).toBe(false);
  });

  test("a non-macro field alone does not count as having macros", () => {
    expect(hasMacros({ sodiumContent: "5" })).toBe(false);
  });
});
