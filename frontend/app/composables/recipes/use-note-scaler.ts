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

// Glued unit abbreviations: `30g` is normal kitchen shorthand (16 library rows), and the
// strict boundary below was rejecting it. This is a WHITELIST, not a loosened boundary —
// glued letters scale only when they are a known unit ending at a word boundary, so `7-Up`,
// `2% milk`, and `30gs` stay protected. Overlapping prefixes (l/lb/lbs) resolve by
// backtracking against the trailing word-boundary lookahead; alternation order is cosmetic.
const GLUED_UNITS = "(?:kg|mg|ml|g|oz|lbs|lb|l|tbsp|tbs|tsp|cups|cup)";

// lead-whitespace, first value, optional range partner, then EITHER a glued whitelisted unit
// (captured, preserved as written) OR the hard boundary (whitespace / `(` / end).
const LEADING_TOKEN_RE = new RegExp(
  `^(\\s*)(${NUM})(?:\\s*[-–—]\\s*(${NUM}))?(?:(${GLUED_UNITS})(?![A-Za-z0-9])|(?=[\\s(]|$))`,
  "i",
);

// Ordinal fractions — `1/6th Batch` — need their own branch: the glued suffix fails the
// boundary above, so before this branch existed the line was silently untouched.
const ORDINAL_RE = /^(\s*)(\d+)\s*\/\s*(\d+)(st|nd|rd|th)(?![A-Za-z0-9])/i;

// Unit words for the equivalent-parenthetical heuristic (abbreviations + spelled out).
const UNIT_WORDS = new Set([
  "g", "kg", "mg", "oz", "lb", "lbs", "ml", "l", "tsp", "tbsp", "tbs", "cup", "cups",
  "teaspoon", "teaspoons", "tablespoon", "tablespoons", "gram", "grams", "ounce", "ounces",
  "pound", "pounds", "liter", "liters", "litre", "litres",
]);

const PAREN_EQUIV_RE = new RegExp(`^(\\s*\\(\\s*)(${NUM})(\\s*)([A-Za-z]+)(\\s*\\))`);

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
 * characters (`¾`, `1½`), sixteenths as ascii (`1/16`, `1 3/16` — no unicode glyph exists
 * for them), everything else a 2-decimal number. */
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

  // Sixteenths — `1/4 tsp` at ¼ used to fall through to "0.06 tsp", which is not a kitchen
  // number. Odd numerators only: even ones reduce and were caught by the vulgar table above.
  for (let numerator = 1; numerator < 16; numerator += 2) {
    if (Math.abs(remainder - numerator / 16) < 0.01) {
      return whole > 0 ? `${whole} ${numerator}/16` : `${numerator}/16`;
    }
  }

  return String(Math.round(value * 100) / 100);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function ordinalSuffix(denominator: number): string {
  const mod100 = denominator % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }
  switch (denominator % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

/** `1/6th Batch` at ½ -> `1/12th Batch`. Rational arithmetic keeps the output an exact ascii
 * fraction (never `0.08th`); the suffix is recomputed for the new denominator (`1/3rd` at 2×)
 * and dropped entirely when the result is whole. Null = shape not scalable at this scale. */
function scaleOrdinal(note: string, scale: number): string | null {
  const match = note.match(ORDINAL_RE);
  if (!match) {
    return null;
  }
  const [full, lead, numeratorStr, denominatorStr] = match;
  const numerator = parseInt(numeratorStr!, 10);
  const denominator = parseInt(denominatorStr!, 10);
  if (!numerator || !denominator) {
    return null;
  }

  // Keep it exact: scale the numerator when that stays whole, else the denominator. An
  // arbitrary stepper scale that fits neither leaves the line untouched rather than garbled.
  let newNumerator = numerator * scale;
  let newDenominator = denominator;
  if (Math.abs(newNumerator - Math.round(newNumerator)) > 1e-9) {
    newNumerator = numerator;
    newDenominator = denominator / scale;
    if (Math.abs(newDenominator - Math.round(newDenominator)) > 1e-9) {
      return note;
    }
  }
  newNumerator = Math.round(newNumerator);
  newDenominator = Math.round(newDenominator);
  const divisor = gcd(newNumerator, newDenominator);
  newNumerator /= divisor;
  newDenominator /= divisor;

  const rest = note.slice(full!.length);
  if (newDenominator === 1) {
    return `${lead}${newNumerator}${rest}`;
  }
  return `${lead}${newNumerator}/${newDenominator}${ordinalSuffix(newDenominator)}${rest}`;
}

/**
 * `60g (4 Tbsp) butter` — when the LEADING quantity carries a unit (glued or spaced), an
 * immediately-following `(qty unit)` parenthetical is an EQUIVALENT of the same amount and
 * must scale with it, or the two numbers disagree (`30g (4 Tbsp)`). A BARE leading count
 * keeps the original rule — the parenthetical is a container size and never scales
 * (`1 (15 oz) can` -> `½ (15 oz) can`): that one predicate also reads `2 (8 oz) cream
 * cheese` correctly (two packages; the package size is fixed).
 */
function scaleEquivalentParenthetical(segment: string, scale: number, leadingHadGluedUnit: boolean): string {
  let unitLength = 0;
  if (!leadingHadGluedUnit) {
    const spacedUnit = segment.match(/^(\s+)([A-Za-z]+)(?![A-Za-z])/);
    if (!spacedUnit || !UNIT_WORDS.has(spacedUnit[2]!.toLowerCase())) {
      return segment;
    }
    unitLength = spacedUnit[0].length;
  }
  const afterUnit = segment.slice(unitLength);
  const paren = afterUnit.match(PAREN_EQUIV_RE);
  if (!paren || !UNIT_WORDS.has(paren[4]!.toLowerCase())) {
    return segment;
  }
  const innerValue = parseQuantityToken(paren[2]!);
  if (Number.isNaN(innerValue)) {
    return segment;
  }
  const scaledInner = formatScaledQuantity(innerValue * scale);
  return (
    segment.slice(0, unitLength)
    + paren[1]
    + scaledInner
    + paren[3]
    + paren[4]
    + paren[5]
    + afterUnit.slice(paren[0].length)
  );
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

  const ordinal = scaleOrdinal(note, scale);
  if (ordinal !== null) {
    return ordinal;
  }

  const match = note.match(LEADING_TOKEN_RE);
  if (!match) {
    return note;
  }

  const [full, lead, first, second, glued] = match;
  const firstValue = parseQuantityToken(first!);
  if (Number.isNaN(firstValue)) {
    return note;
  }

  const rest = note.slice(full.length);

  // Below 1/16 there is no honest kitchen fraction left. When the unit is a teaspoon the
  // cook's word for it is "pinch" — the quantity AND the tsp word collapse into it
  // (`1/8 tsp cayenne` at ¼ -> `pinch cayenne`, glued `1/8tsp` included). Single values
  // only: ranges keep numbers, and non-tsp units keep the 2-decimal fallback.
  if (second === undefined && firstValue * scale < 1 / 16 - 1e-9) {
    if (glued && /^tsp$/i.test(glued)) {
      return `${lead}pinch${rest}`;
    }
    if (!glued) {
      const tspMatch = rest.match(/^(\s+)(tsp\.?|teaspoons?)(?=[\s,]|$)/i);
      if (tspMatch) {
        return `${lead}pinch${rest.slice(tspMatch[0].length)}`;
      }
    }
  }

  let scaled = formatScaledQuantity(firstValue * scale);
  if (second !== undefined) {
    const secondValue = parseQuantityToken(second);
    if (Number.isNaN(secondValue)) {
      return note;
    }
    scaled += `-${formatScaledQuantity(secondValue * scale)}`;
  }

  // Equivalent parentheticals scale for single values only — a range with an equivalent is
  // not a shape the library has, and guessing would disagree with one end or the other.
  const tail = second === undefined ? scaleEquivalentParenthetical(rest, scale, !!glued) : rest;

  return lead + scaled + (glued ?? "") + tail;
}
