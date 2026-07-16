/**
 * Read a free-form string out of a recipe's API extras.
 *
 * Extras are user-entered and free-form, so anything can be in there — blank, whitespace, or
 * (via the API) not a string at all. Everything that reads extras must degrade to "" rather
 * than render the junk, which is why this is one function instead of the same ternary twice.
 */
export function extraText(extras: Record<string, unknown> | null | undefined, key: string): string {
  const raw = (extras || {})[key];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * How to name ONE portion: "1/4 of the Pan", or "1 Cookie".
 *
 * "Makes 4 Servings" is not a substitute for this. It makes the reader do arithmetic to recover
 * a fact the source stated outright ("for 1/4th the Pan"), and it never names the pan at all.
 *
 * `servingPhrase` replaces the whole quantity+noun, because the "1 " is otherwise literal in the
 * template and no data value can remove it — `servingUnit: "/4 of the Pan"` renders
 * "Macros for 1 /4 of the Pan". It is deliberately NOT merged with `servingUnit`, which still
 * names the *unit* ("Cookie") and feeds the singular guesser: a recipe can want either.
 *
 * Falls back to exactly what the template hardcoded before, so the 147 recipes without a phrase
 * must not move by so much as a space.
 */
export function portionLabel(
  extras: Record<string, unknown> | null | undefined,
  unitLabel: string,
): string {
  return extraText(extras, "servingPhrase") || `1 ${unitLabel}`;
}
