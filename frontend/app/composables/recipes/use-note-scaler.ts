/**
 * Leading-token text scaling for unparsed ingredient notes.
 *
 * Why this exists: the live library's 2,988 ingredient rows are ALL unparsed text notes
 * (quantity=0, no food, no unit — audited 2026-08-18), so upstream's structured-quantity
 * scaler is a no-op on every recipe. Scaling therefore rewrites the note's LEADING quantity
 * token at display time — `'1.5 lb Chicken Breast'` at ½ renders `'¾ lb Chicken Breast'` —
 * and never touches stored data. Running the ingredient parser over the library to "fix" the
 * data instead was considered and rejected: it would mutate all 273 recipes and change
 * rendering everywhere.
 *
 * The rules are deliberately boring:
 * - Only the leading token scales: integers, decimals, ascii fractions (`1/2`, `1 1/2`),
 *   unicode fractions (`½`, `1½`), and simple ranges (`2-3`, both ends).
 * - The token must be followed by whitespace, `(`, or end-of-string — so `2% milk`,
 *   `7-Up`, and mid-string numbers (`cut into 8 pieces`, `(15 oz)`) are never touched.
 * - No leading number → the line renders unchanged.
 * - scale === 1 returns the EXACT input string (byte-identical), so the default render path
 *   is provably untouched by this feature.
 */

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 1 / 4, "½": 1 / 2, "¾": 3 / 4,
  "⅐": 1 / 7, "⅑": 1 / 9, "⅒": 1 / 10,
  "⅓": 1 / 3, "⅔": 2 / 3,
  "⅕": 1 / 5, "⅖": 2 / 5, "⅗": 3 / 5, "⅘": 4 / 5,
  "⅙": 1 / 6, "⅚": 5 / 6,
  "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
};

const FRACTION_CLASS = `[${Object.keys(UNICODE_FRACTIONS).join("")}]`;

// Longest alternatives first, or "1 1/2" matches as "1" and "1½" as "1".
const NUM = `(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+\\s*${FRACTION_CLASS}|\\d+\\.\\d+|\\d+|${FRACTION_CLASS})`;

// lead-whitespace, first value, optional range partner, then a hard boundary (lookahead).
const LEADING_TOKEN_RE = new RegExp(`^(\\s*)(${NUM})(?:\\s*[-–—]\\s*(${NUM}))?(?=[\\s(]|$)`);

/** "1 1/2" | "1/2" | "1½" | "½" | "1.5" | "2" → number. Returns NaN on anything else. */
export function parseQuantityToken(token: string): number {
  const trimmed = token.trim();

  const lastChar = trimmed[trimmed.length - 1] ?? "";
  if (UNICODE_FRACTIONS[lastChar] !== undefined) {
    const whole = trimmed.slice(0, -1).trim();
    return (whole ? parseInt(whole, 10) : 0) + UNICODE_FRACTIONS[lastChar];
  }

  const fraction = trimmed.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = parseInt(fraction[3]!, 10);
    if (denominator === 0) {
      return NaN;
    }
    return (fraction[1] ? parseInt(fraction[1], 10) : 0) + parseInt(fraction[2]!, 10) / denominator;
  }

  return /^\d+(?:\.\d+)?$/.test(trimmed) ? parseFloat(trimmed) : NaN;
}

// Kitchen fractions, common first. Tolerance ±0.01 absorbs float noise (0.3333 → ⅓)
// without stealing values that are honestly decimal (0.35 stays 0.35).
const VULGAR: [number, string][] = [
  [1 / 2, "½"], [1 / 3, "⅓"], [2 / 3, "⅔"], [1 / 4, "¼"], [3 / 4, "¾"],
  [1 / 8, "⅛"], [3 / 8, "⅜"], [5 / 8, "⅝"], [7 / 8, "⅞"],
  [1 / 6, "⅙"], [5 / 6, "⅚"],
  [1 / 5, "⅕"], [2 / 5, "⅖"], [3 / 5, "⅗"], [4 / 5, "⅘"],
];

/** A scaled amount, kitchen-formatted: whole numbers plain, nice fractions as vulgar
 * characters (`¾`, `1½`), everything else a 2-decimal number. */
export function formatScaledQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  const whole = Math.floor(value + 1e-9);
  const remainder = value - whole;
  if (remainder < 1e-4) {
    return String(whole);
  }

  for (const [fraction, glyph] of VULGAR) {
    if (Math.abs(remainder - fraction) < 0.01) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }

  return String(Math.round(value * 100) / 100);
}

/**
 * Scale the leading quantity token of an ingredient note. Display-time only — callers must
 * never write the result back to the recipe.
 */
export function scaleIngredientNote(note: string, scale: number): string {
  // The byte-identity contract: at scale 1 the caller gets the exact stored string.
  if (scale === 1 || !note) {
    return note;
  }

  const match = note.match(LEADING_TOKEN_RE);
  if (!match) {
    return note;
  }

  const [full, lead, first, second] = match;
  const firstValue = parseQuantityToken(first!);
  if (Number.isNaN(firstValue)) {
    return note;
  }

  let scaled = formatScaledQuantity(firstValue * scale);
  if (second !== undefined) {
    const secondValue = parseQuantityToken(second);
    if (Number.isNaN(secondValue)) {
      return note;
    }
    scaled += `-${formatScaledQuantity(secondValue * scale)}`;
  }

  return lead + scaled + note.slice(full.length);
}
