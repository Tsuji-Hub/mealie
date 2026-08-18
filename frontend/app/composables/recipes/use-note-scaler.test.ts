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
});
