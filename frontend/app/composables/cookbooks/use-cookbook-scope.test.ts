import { describe, test, expect } from "vitest";
import { cookbookForCategory, isScopedByCategory, organizerRoute } from "./use-cookbook-scope";
import type { QueryFilterJSONPart, ReadCookBook } from "~/lib/api/types/cookbook";
import type { RecipeCategory } from "~/lib/api/types/recipe";

/**
 * Shapes here are copied from the live instance, not invented — the bug this pins was a
 * guard that looked reasonable against imagined data and was wrong against real data.
 */
describe("isScopedByCategory", () => {
  const category = (name: string): RecipeCategory =>
    ({ id: "cat-id", name, slug: "slug" }) as RecipeCategory;

  const cookbook = (parts: QueryFilterJSONPart[] | undefined, overrides: Partial<ReadCookBook> = {}): ReadCookBook =>
    ({
      id: "cb-id",
      name: "a cookbook",
      groupId: "group-id",
      householdId: "household-id",
      // null on purpose: this is what GET /households/cookbooks/{id} actually returns.
      recipeCount: null,
      queryFilter: parts ? { parts } : undefined,
      ...overrides,
    }) as ReadCookBook;

  const namePart = (values: string[] | string): QueryFilterJSONPart =>
    ({
      leftParenthesis: null,
      rightParenthesis: null,
      logicalOperator: null,
      attributeName: "recipe_category.name",
      relationalOperator: Array.isArray(values) ? "IN" : "=",
      value: values,
    }) as QueryFilterJSONPart;

  /**
   * THE REGRESSION TEST. A `recipeCount == null` guard used to sit at the top of this
   * predicate. recipeCount is only populated on the cookbook LIST route, so on the cookbook
   * page (getOne) it is always null — the guard always returned false and the vanish could
   * never fire. It failed silently: no error, lint and build green, feature quietly dead.
   * Re-add that guard and THIS test must go red. If it can't fail, it isn't a regression test.
   */
  test("REGRESSION: matches when recipeCount is null (getOne never populates it)", () => {
    const book = cookbook([namePart(["Appetizers & Sides 🍟"])], { recipeCount: null });
    expect(isScopedByCategory(book, category("Appetizers & Sides 🍟"))).toBe(true);
  });

  test("matches the scoping category, so the card vanishes", () => {
    const book = cookbook([namePart(["Appetizers & Sides 🍟"])]);
    expect(isScopedByCategory(book, category("Appetizers & Sides 🍟"))).toBe(true);
  });

  test("does not match another category the recipe happens to be in, so the card stays", () => {
    const book = cookbook([namePart(["Appetizers & Sides 🍟"])]);
    expect(isScopedByCategory(book, category("Dinner"))).toBe(false);
  });

  test("matches the filter value, not the cookbook title (they differ)", () => {
    // Live: cookbook "Quickies ⏩ (<20min)" filters the category "Quickies (<20min)".
    const book = cookbook([namePart(["Quickies (<20min)"])], { name: "Quickies ⏩ (<20min)" });
    expect(isScopedByCategory(book, category("Quickies (<20min)"))).toBe(true);
    expect(isScopedByCategory(book, category("Quickies ⏩ (<20min)"))).toBe(false);
  });

  test("compares names exactly — emoji and apostrophes are not normalised", () => {
    expect(isScopedByCategory(cookbook([namePart(["Gertrude's Sourdough"])]), category("Gertrude's Sourdough"))).toBe(true);
    expect(isScopedByCategory(cookbook([namePart(["Fucking ew 🤢"])]), category("Fucking ew"))).toBe(false);
    expect(isScopedByCategory(cookbook([namePart(["Appetizers & Sides 🍟"])]), category("Appetizers & Sides"))).toBe(false);
  });

  test("supports an = operator as well as IN", () => {
    expect(isScopedByCategory(cookbook([namePart("Dinner")]), category("Dinner"))).toBe(true);
  });

  test("multiple values in one IN part still match", () => {
    const book = cookbook([namePart(["Dinner", "Salads"])]);
    expect(isScopedByCategory(book, category("Salads"))).toBe(true);
  });

  describe("fails safe — leaves the card alone rather than guessing", () => {
    test("filters on recipe_category.id, not .name", () => {
      const part = { ...namePart(["Dinner"]), attributeName: "recipe_category.id" };
      expect(isScopedByCategory(cookbook([part]), category("Dinner"))).toBe(false);
    });

    test("Uncategorized: recipe_category.id IS NONE", () => {
      const part = {
        attributeName: "recipe_category.id",
        relationalOperator: "IS NONE",
        value: null,
      } as QueryFilterJSONPart;
      expect(isScopedByCategory(cookbook([part]), category("Dinner"))).toBe(false);
    });

    test("a tag filter", () => {
      const part = { ...namePart(["FDL"]), attributeName: "tags.name" };
      expect(isScopedByCategory(cookbook([part]), category("FDL"))).toBe(false);
    });

    test("multi-part / OR filters", () => {
      const parts = [
        namePart(["Dinner"]),
        { ...namePart(["Salads"]), logicalOperator: "OR" } as QueryFilterJSONPart,
      ];
      expect(isScopedByCategory(cookbook(parts), category("Dinner"))).toBe(false);
    });

    test("a part wrapped in parentheses", () => {
      const part = { ...namePart(["Dinner"]), leftParenthesis: "(", rightParenthesis: ")" };
      expect(isScopedByCategory(cookbook([part]), category("Dinner"))).toBe(false);
    });

    test("an unsupported operator", () => {
      const part = { ...namePart(["Dinner"]), relationalOperator: "LIKE" } as QueryFilterJSONPart;
      expect(isScopedByCategory(cookbook([part]), category("Dinner"))).toBe(false);
    });

    test("no cookbook, no filter, or no parts", () => {
      expect(isScopedByCategory(null, category("Dinner"))).toBe(false);
      expect(isScopedByCategory(undefined, category("Dinner"))).toBe(false);
      expect(isScopedByCategory(cookbook(undefined), category("Dinner"))).toBe(false);
      expect(isScopedByCategory(cookbook([]), category("Dinner"))).toBe(false);
    });
  });

  describe("cookbookForCategory — the pill's category -> cookbook lookup", () => {
    const library = [
      cookbook([namePart(["Breakfast"])], { name: "Breakfast", slug: "breakfast" }),
      cookbook([namePart(["Dinner"])], { name: "Dinner", slug: "dinner" }),
      // A cookbook the predicate must refuse: multi-part filters are not category-scoped.
      cookbook(
        [namePart(["Dinner"]), { ...namePart(["Salads"]), logicalOperator: "OR" } as QueryFilterJSONPart],
        { name: "Combined", slug: "combined" },
      ),
    ];

    test("finds the cookbook whose filter names the category", () => {
      expect(cookbookForCategory(library, category("Dinner"))?.slug).toBe("dinner");
      expect(cookbookForCategory(library, category("Breakfast"))?.slug).toBe("breakfast");
    });

    test("a category with no cookbook returns undefined, so the caller keeps its fallback", () => {
      expect(cookbookForCategory(library, category("Uncookbooked"))).toBeUndefined();
      expect(cookbookForCategory([], category("Dinner"))).toBeUndefined();
      expect(cookbookForCategory(null, category("Dinner"))).toBeUndefined();
    });
  });

  describe("organizerRoute — where a chip click lands", () => {
    const library = [cookbook([namePart(["Dinner"])], { name: "Dinner", slug: "dinner" })];

    test("a category pill routes to its cookbook page — the instant route", () => {
      expect(organizerRoute("home", category("Dinner"), "categories", library)).toBe(
        "/g/home/cookbooks/dinner",
      );
    });

    test("a category without a cookbook keeps the filtered explorer — a pill must never dead-end", () => {
      expect(organizerRoute("home", category("Lonely"), "categories", library)).toBe(
        "/g/home?categories=cat-id",
      );
      expect(organizerRoute("home", category("Dinner"), "categories", [])).toBe(
        "/g/home?categories=cat-id",
      );
    });

    test("tags and tools always take the explorer — only categories are cookbooks in this fork", () => {
      // A tag named identically to a cookbook's category must NOT hijack the cookbook route.
      const dinnerTag = { id: "tag-id", name: "Dinner", slug: "dinner" };
      expect(organizerRoute("home", dinnerTag, "tags", library)).toBe("/g/home?tags=tag-id");
      expect(organizerRoute("home", { id: "tool-id", name: "Dinner" }, "tools", library)).toBe(
        "/g/home?tools=tool-id",
      );
    });
  });
});
