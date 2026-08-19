import { describe, expect, test } from "vitest";
import { formatScaledQuantity, parseQuantityToken, scaleIngredientNote } from "./use-note-scaler";

/**
 * The library this ships to has 2,988 ingredient rows and every one is an unparsed text note
 * (quantity=0, no food, no unit) — upstream's structured scaler is a no-op there, so THIS
 * module is the entire scaling feature. The cases below are the brief's acceptance set.
 */

describe("scaleIngredientNote — the brief's exact cases", () => {
  test("'1.5 lb Chicken Breast cut into Tenders' at ½ — the 8-free case scales, tail untouched", () => {
    expect(scaleIngredientNote("1.5 lb Chicken Breast cut into Tenders", 0.5))
      .toBe("¾ lb Chicken Breast cut into Tenders");
  });

  test("'40 g All Purpose Flour' at ½ and ¼", () => {
    expect(scaleIngredientNote("40 g All Purpose Flour", 0.5)).toBe("20 g All Purpose Flour");
    expect(scaleIngredientNote("40 g All Purpose Flour", 0.25)).toBe("10 g All Purpose Flour");
  });

  test("'100 g Egg Whites' at ¼/½/2", () => {
    expect(scaleIngredientNote("100 g Egg Whites", 0.25)).toBe("25 g Egg Whites");
    expect(scaleIngredientNote("100 g Egg Whites", 0.5)).toBe("50 g Egg Whites");
    expect(scaleIngredientNote("100 g Egg Whites", 2)).toBe("200 g Egg Whites");
  });

  test("'1½ cups sugar' — mixed unicode fraction input", () => {
    expect(scaleIngredientNote("1½ cups sugar", 0.5)).toBe("¾ cups sugar");
    expect(scaleIngredientNote("1½ cups sugar", 2)).toBe("3 cups sugar");
    expect(scaleIngredientNote("1½ cups sugar", 0.25)).toBe("⅜ cups sugar");
  });

  test("'2-3 cloves garlic' — both ends of a range scale", () => {
    expect(scaleIngredientNote("2-3 cloves garlic", 0.5)).toBe("1-1½ cloves garlic");
    expect(scaleIngredientNote("2-3 cloves garlic", 0.25)).toBe("½-¾ cloves garlic");
    expect(scaleIngredientNote("2-3 cloves garlic", 2)).toBe("4-6 cloves garlic");
  });

  test("'1 (15 oz) can tomato sauce' — the container size NEVER scales", () => {
    expect(scaleIngredientNote("1 (15 oz) can tomato sauce", 0.5)).toBe("½ (15 oz) can tomato sauce");
    expect(scaleIngredientNote("1 (15 oz) can tomato sauce", 2)).toBe("2 (15 oz) can tomato sauce");
  });

  test("'Salt to taste' and friends — no leading number, byte-identical at every scale", () => {
    for (const scale of [0.25, 0.5, 2]) {
      expect(scaleIngredientNote("Salt to taste", scale)).toBe("Salt to taste");
      expect(scaleIngredientNote("Butter, softened", scale)).toBe("Butter, softened");
    }
  });

  test("numbers elsewhere in the string are never touched", () => {
    expect(scaleIngredientNote("1.5 lb chicken cut into 8 pieces", 0.5))
      .toBe("¾ lb chicken cut into 8 pieces");
  });
});

describe("scaleIngredientNote — contracts and traps", () => {
  test("scale=1 returns the EXACT input string (byte-identity — acceptance #3)", () => {
    const inputs = ["1.5 lb Chicken Breast", "  40 g Flour", "Salt to taste", "2% milk", ""];
    for (const input of inputs) {
      expect(scaleIngredientNote(input, 1)).toBe(input);
    }
  });

  test("'2% milk' — a percentage is not a quantity", () => {
    expect(scaleIngredientNote("2% milk", 0.5)).toBe("2% milk");
  });

  test("'7-Up' — a range needs numbers on both ends", () => {
    expect(scaleIngredientNote("7-Up, one can", 0.5)).toBe("7-Up, one can");
  });

  test("ascii fractions, plain and mixed", () => {
    expect(scaleIngredientNote("1/2 cup broth", 0.5)).toBe("¼ cup broth");
    expect(scaleIngredientNote("1 1/2 cups flour", 2)).toBe("3 cups flour");
  });

  test("leading whitespace is preserved", () => {
    expect(scaleIngredientNote("  2 eggs", 0.5)).toBe("  1 eggs");
  });

  test("thirds land on kitchen fractions, not repeating decimals", () => {
    expect(scaleIngredientNote("1/3 cup oil", 0.5)).toBe("⅙ cup oil");
    expect(scaleIngredientNote("2 cups stock", 1 / 3)).toBe("⅔ cups stock");
  });
});

describe("parseQuantityToken", () => {
  test("all supported forms", () => {
    expect(parseQuantityToken("2")).toBe(2);
    expect(parseQuantityToken("1.5")).toBe(1.5);
    expect(parseQuantityToken("1/2")).toBe(0.5);
    expect(parseQuantityToken("1 1/2")).toBe(1.5);
    expect(parseQuantityToken("½")).toBe(0.5);
    expect(parseQuantityToken("1½")).toBe(1.5);
  });

  test("junk is NaN, division by zero included", () => {
    expect(parseQuantityToken("abc")).toBeNaN();
    expect(parseQuantityToken("1/0")).toBeNaN();
  });
});

describe("glued units — the turnovers bug (PROMPT N.2)", () => {
  test("the three missed gram lines, at ½ and ¼", () => {
    expect(scaleIngredientNote("30g vanilla whey/casein protein powder", 0.5)).toBe("15g vanilla whey/casein protein powder");
    expect(scaleIngredientNote("30g vanilla whey/casein protein powder", 0.25)).toBe("7½g vanilla whey/casein protein powder");
    expect(scaleIngredientNote("15g powdered sugar", 0.5)).toBe("7½g powdered sugar");
    expect(scaleIngredientNote("15g powdered sugar", 0.25)).toBe("3¾g powdered sugar");
    expect(scaleIngredientNote("4g cheesecake sugar-free/fat-free pudding mix", 0.5)).toBe("2g cheesecake sugar-free/fat-free pudding mix");
    expect(scaleIngredientNote("4g cheesecake sugar-free/fat-free pudding mix", 0.25)).toBe("1g cheesecake sugar-free/fat-free pudding mix");
  });

  test("glued unit is preserved exactly as written, case included", () => {
    expect(scaleIngredientNote("2lb brisket", 0.5)).toBe("1lb brisket");
    expect(scaleIngredientNote("30G protein powder", 0.5)).toBe("15G protein powder");
    expect(scaleIngredientNote("250ml cream", 0.5)).toBe("125ml cream");
  });

  test("glued letters that are NOT a whitelisted unit keep the strict boundary", () => {
    expect(scaleIngredientNote("30gs of something", 0.5)).toBe("30gs of something");
    expect(scaleIngredientNote("2% milk", 0.5)).toBe("2% milk"); // pinned regression
    expect(scaleIngredientNote("7-Up, one can", 0.5)).toBe("7-Up, one can"); // pinned regression
  });

  test("glued tsp joins the pinch rule", () => {
    expect(scaleIngredientNote("1/8tsp cayenne", 0.25)).toBe("pinch cayenne");
    expect(scaleIngredientNote("1/8tsp cayenne", 0.5)).toBe("1/16tsp cayenne");
  });
});

describe("equivalent vs container parentheticals (PROMPT N.2)", () => {
  test("leading quantity WITH a unit: the parenthetical is an equivalent and scales too", () => {
    expect(scaleIngredientNote("60g (4 Tbsp) butter", 0.5)).toBe("30g (2 Tbsp) butter");
    expect(scaleIngredientNote("60g (4 Tbsp) butter", 0.25)).toBe("15g (1 Tbsp) butter");
    expect(scaleIngredientNote("60 g (4 Tbsp) butter", 0.5)).toBe("30 g (2 Tbsp) butter");
  });

  test("bare leading count: the parenthetical is a container size and NEVER scales", () => {
    expect(scaleIngredientNote("1 (15 oz) can tomato sauce", 0.5)).toBe("½ (15 oz) can tomato sauce"); // pinned
    expect(scaleIngredientNote("2 (8 oz) packages cream cheese", 0.5)).toBe("1 (8 oz) packages cream cheese");
  });
});

describe("ordinal fractions (PROMPT N.2)", () => {
  test("scaled as exact fractions, suffix recomputed", () => {
    expect(scaleIngredientNote("1/6th Batch Elote Sauce", 0.5)).toBe("1/12th Batch Elote Sauce");
    expect(scaleIngredientNote("1/6th Batch Elote Sauce", 0.25)).toBe("1/24th Batch Elote Sauce");
    expect(scaleIngredientNote("1/6th Batch Elote Sauce", 2)).toBe("1/3rd Batch Elote Sauce");
    expect(scaleIngredientNote("1/4th Batch of Chicken", 0.5)).toBe("1/8th Batch of Chicken");
  });

  test("a whole result drops the suffix; unscalable shapes stay untouched", () => {
    expect(scaleIngredientNote("1/2nd Batch", 2)).toBe("1 Batch");
    expect(scaleIngredientNote("1/6th Batch", 1 / 3)).toBe("1/18th Batch");
  });
});

describe("census stragglers pinned (PROMPT N.2)", () => {
  test("mixed unicode with spelled units, unicode starts, and fraction ranges", () => {
    expect(scaleIngredientNote("1½ teaspoon vanilla", 0.5)).toBe("¾ teaspoon vanilla");
    expect(scaleIngredientNote("1¼ lb ground beef", 0.5)).toBe("⅝ lb ground beef");
    expect(scaleIngredientNote("1/4-1/2 tsp cayenne", 0.5)).toBe("⅛-¼ tsp cayenne");
    expect(scaleIngredientNote("½ cup water", 0.5)).toBe("¼ cup water"); // the 31 unicode-start rows
  });

  test("spaced-unit and no-number regressions hold", () => {
    expect(scaleIngredientNote("40 g All Purpose Flour", 0.5)).toBe("20 g All Purpose Flour");
    expect(scaleIngredientNote("1.5 lb Chicken Breast cut into Tenders", 0.5)).toBe("¾ lb Chicken Breast cut into Tenders");
    expect(scaleIngredientNote("Salt to taste", 0.5)).toBe("Salt to taste");
  });

  test("byte-identity at 1× includes every new shape", () => {
    for (const line of ["30g protein", "60g (4 Tbsp) butter", "1/6th Batch", "1/8tsp cayenne"]) {
      expect(scaleIngredientNote(line, 1)).toBe(line);
    }
  });
});

describe("formatScaledQuantity", () => {
  test("kitchen formatting", () => {
    expect(formatScaledQuantity(3)).toBe("3");
    expect(formatScaledQuantity(0.75)).toBe("¾");
    expect(formatScaledQuantity(1.5)).toBe("1½");
    expect(formatScaledQuantity(0.375)).toBe("⅜");
    expect(formatScaledQuantity(1 / 6)).toBe("⅙");
    expect(formatScaledQuantity(0.35)).toBe("0.35");
    expect(formatScaledQuantity(0)).toBe("0");
  });

  test("sixteenths render as ascii fractions, not decimals (PROMPT N polish)", () => {
    expect(formatScaledQuantity(1 / 16)).toBe("1/16");
    expect(formatScaledQuantity(3 / 16)).toBe("3/16");
    expect(formatScaledQuantity(1 + 3 / 16)).toBe("1 3/16");
    // even sixteenths keep reducing to the vulgar table
    expect(formatScaledQuantity(2 / 16)).toBe("⅛");
  });
});

describe("sixteenths and the pinch rule (PROMPT N)", () => {
  test("'1/4 tsp vanilla' at ¼ shows 1/16 tsp, not 0.06 — the reported bug", () => {
    expect(scaleIngredientNote("1/4 tsp vanilla", 0.25)).toBe("1/16 tsp vanilla");
  });

  test("'⅛ tsp cayenne' at ½ is a sixteenth; at ¼ it collapses to a pinch", () => {
    expect(scaleIngredientNote("⅛ tsp cayenne", 0.5)).toBe("1/16 tsp cayenne");
    expect(scaleIngredientNote("⅛ tsp cayenne", 0.25)).toBe("pinch cayenne");
    expect(scaleIngredientNote("1/8 teaspoon cayenne", 0.25)).toBe("pinch cayenne");
  });

  test("pinch is tsp-only — other units keep the decimal fallback", () => {
    expect(scaleIngredientNote("1/8 cup broth", 0.25)).toBe("0.03 cup broth");
  });

  test("ranges never collapse to pinch and can carry sixteenths", () => {
    expect(scaleIngredientNote("1/4-1/2 tsp chili flakes", 0.25)).toBe("1/16-⅛ tsp chili flakes");
  });
});
