import type { ReadCookBook } from "~/lib/api/types/cookbook";
import type { RecipeCategory } from "~/lib/api/types/recipe";

/**
 * Say why we declined. Biasing to "do nothing" is right for the user — wrongly vanishing a
 * card looks like data loss — but it makes this function silent to the developer, and that
 * silence is what let a dead guard ship green. A decline is normal, so this is debug-level:
 * a debugging surface, not telemetry. Never called on the success path.
 */
function decline(reason: string): false {
  console.debug(`[cookbook-scope] vanish declined: ${reason}`);
  return false;
}

/**
 * Is this cookbook scoped by this category?
 *
 * Used to decide whether unfiling a recipe should drop its card from the cookbook you are
 * currently viewing. A pure question about two values — kept pure (no refs, no closure) so
 * it can be pinned by tests. It previously closed over the page's `book` ref, which is
 * exactly why the bug below shipped untested.
 *
 * The filter is parsed server-side and shipped as `queryFilter.parts`, so this reads it
 * rather than re-implementing Mealie's filter DSL — a hand-rolled parser would be silently
 * wrong the first time a filter used parens or IN.
 *
 * Recognises only the narrow, unambiguous shape: a single bare part on
 * `recipe_category.name` with IN/=. Anything else — parens, OR, extra clauses, a tag/tool
 * filter — returns false and the card simply stays. The costs are asymmetric: a stale card
 * is the old behaviour and a refresh fixes it; wrongly vanishing one looks like data loss
 * and the user has no idea why. Bias to doing nothing.
 *
 * Do NOT add a `recipeCount` guard. It says nothing about whether a cookbook is scoped by a
 * category — that is entirely `queryFilter.parts`. It is also only stitched onto the LIST
 * route, so on the cookbook page (which loads via getOne) it is always null; guarding on it
 * disabled this whole feature silently. Every guard here must test something that actually
 * bears on the question. See use-cookbook-scope.test.ts.
 */
export function isScopedByCategory(
  cookbook: ReadCookBook | null | undefined,
  category: RecipeCategory,
): boolean {
  if (!cookbook) {
    return decline("no cookbook loaded");
  }

  const parts = cookbook.queryFilter?.parts;
  if (!parts || parts.length !== 1) {
    return decline(`filter is not a single part (parts=${parts?.length ?? 0})`);
  }

  const part = parts[0];
  if (!part || part.leftParenthesis || part.rightParenthesis || part.logicalOperator) {
    return decline("filter part is not bare (parens or logical operator)");
  }

  // Match on the category NAME: cookbooks filter on `recipe_category.name` with the name
  // string, not a UUID. Matching on id finds nothing, and because this fails safe the
  // vanish would silently never fire.
  if (part.attributeName !== "recipe_category.name") {
    return decline(`filters on ${part.attributeName}, not recipe_category.name`);
  }

  const operator = String(part.relationalOperator || "").toUpperCase();
  if (operator !== "IN" && operator !== "=") {
    return decline(`operator is ${operator || "(none)"}, not IN or =`);
  }

  // Compare exactly — names carry emoji, apostrophes, parens and "<". Never slugify, and
  // never infer the category from the cookbook's title: they differ
  // (cookbook "Quickies ⏩ (<20min)" filters category "Quickies (<20min)").
  const values = Array.isArray(part.value) ? part.value : part.value == null ? [] : [part.value];
  if (!values.includes(category.name)) {
    // The common, correct case: the recipe was unfiled from some OTHER cookbook's category.
    return decline(`"${category.name}" is not in this cookbook's filter [${values.join(", ")}]`);
  }

  return true;
}
