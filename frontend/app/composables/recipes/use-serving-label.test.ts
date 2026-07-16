import { describe, expect, test } from "vitest";
import { extraText, portionLabel } from "./use-serving-label";

describe("portionLabel", () => {
  /** The 9 fraction recipes. Phrases are the real ones, normalised from FDL's `macrosFor`. */
  test("names the actual portion", () => {
    expect(portionLabel({ servingPhrase: "1/4 of the Pan" }, "Serving")).toBe("1/4 of the Pan");
    expect(portionLabel({ servingPhrase: "1/3 of the Salad" }, "Serving")).toBe("1/3 of the Salad");
    expect(portionLabel({ servingPhrase: "1/5 of the Recipe" }, "Serving")).toBe("1/5 of the Recipe");
  });

  test("no stray 1 and no double space — the reason the template had to change", () => {
    const label = `Macros for ${portionLabel({ servingPhrase: "1/4 of the Pan" }, "Serving")}`;
    expect(label).toBe("Macros for 1/4 of the Pan");
    expect(label).not.toContain("  ");
    expect(label).not.toContain("for 1 1/4");
    expect(label).not.toContain("1 /4");
  });

  /**
   * THE REGRESSION THAT MATTERS: 147 of 156 recipes have no phrase and must be byte-identical
   * to what the hardcoded `Macros for 1 {{ unitLabel }}` produced.
   */
  test("REGRESSION: without a phrase, byte-identical to the old hardcoded template", () => {
    expect(`Macros for ${portionLabel({}, "Cookie")}`).toBe("Macros for 1 Cookie");
    expect(`Macros for ${portionLabel(null, "serving")}`).toBe("Macros for 1 serving");
    expect(`Macros for ${portionLabel(undefined, "Slice w/out Topping")}`).toBe(
      "Macros for 1 Slice w/out Topping",
    );
  });

  test("REGRESSION: the 21 measure recipes are untouched — servingUnit still does its job", () => {
    // These read via servingUnit and are explicitly out of scope; servingPhrase must not hijack them.
    expect(portionLabel({ servingUnit: "Serving (2 Tbsp / 32g)" }, "Serving (2 Tbsp / 32g)")).toBe(
      "1 Serving (2 Tbsp / 32g)",
    );
  });

  test("falls back cleanly rather than rendering 'Macros for '", () => {
    expect(portionLabel({ servingPhrase: "" }, "Cookie")).toBe("1 Cookie");
    expect(portionLabel({ servingPhrase: "   " }, "Cookie")).toBe("1 Cookie");
    expect(portionLabel({ servingPhrase: null }, "Cookie")).toBe("1 Cookie");
    expect(portionLabel({ servingPhrase: 4 }, "Cookie")).toBe("1 Cookie");
    expect(portionLabel({ servingPhrase: ["1/4"] }, "Cookie")).toBe("1 Cookie");
  });

  test("trims, so a stray space in the editor can't produce a double space", () => {
    expect(portionLabel({ servingPhrase: "  1/4 of the Pan  " }, "Serving")).toBe("1/4 of the Pan");
  });

  test("phrase and unit stay separate concerns — a recipe can carry both", () => {
    // servingPhrase names the portion; servingUnit names the unit and feeds the singulariser.
    expect(portionLabel({ servingPhrase: "1/4 of the Pan", servingUnit: "Cookie" }, "Cookie")).toBe(
      "1/4 of the Pan",
    );
  });
});

describe("extraText", () => {
  test("reads a trimmed string", () => {
    expect(extraText({ servingUnit: "  Cookie " }, "servingUnit")).toBe("Cookie");
  });

  test("anything that isn't a usable string reads as empty", () => {
    expect(extraText({}, "servingUnit")).toBe("");
    expect(extraText(null, "servingUnit")).toBe("");
    expect(extraText({ servingUnit: 5 }, "servingUnit")).toBe("");
    expect(extraText({ servingUnit: "   " }, "servingUnit")).toBe("");
  });
});
