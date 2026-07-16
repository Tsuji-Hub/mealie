/**
 * Pull the recipe URL out of an Android share.
 *
 * The Web Share Target spec has separate `url` and `text` fields, but Android apps mostly ignore
 * that distinction: they put everything in `text`, as prose with the link embedded. TikTok shares
 * "Check out this video on TikTok https://vm.tiktok.com/ZM1abc/" — one string, no `url` field at
 * all. So the whole feature turns on reading a link out of a sentence.
 *
 * Requiring the text to BE a URL (`new URL(text)`) only handles the clean-URL case, which is the
 * case nobody actually shares from. It fails by landing on an empty form, so it looks like the
 * share worked right up until you check.
 */

/**
 * First http(s) link in a string.
 *
 * Trailing punctuation is excluded from the match rather than trimmed after: a URL can legitimately
 * end in `)` or `.`, but a sentence's closing bracket or full stop is far more common, and a
 * trailing `.` silently breaks the scrape.
 */
const URL_IN_TEXT = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/i;

/** Sentence punctuation at the very end of a string, e.g. "…/recipe!" or "…/recipe.". */
const TRAILING_PUNCTUATION = /[.,;:!?]$/;

export function extractSharedUrl(
  urlField?: string | null,
  textField?: string | null,
): string | null {
  // `url` is the spec-correct field. Chrome populates it when sharing a page from the browser,
  // and it needs no parsing, so it wins.
  const fromUrl = (urlField || "").trim();
  if (fromUrl) {
    return fromUrl;
  }

  const text = (textField || "").trim();
  if (!text) {
    return null;
  }

  // A text field that is exactly a URL: keep it whole. The regex would also match, but this
  // preserves anything the trailing-punctuation rule would clip (e.g. a URL ending in ")").
  //
  // Both guards are load-bearing. `new URL()` does NOT reject spaces — it percent-encodes them
  // into the path — so "https://a.com/x and also https://b.com" parses as one valid URL and this
  // branch would swallow the whole sentence. And "https://a.com/recipe!" parses too, so without
  // the punctuation check the bang rides along into the scrape.
  if (!/\s/.test(text) && !TRAILING_PUNCTUATION.test(text) && isHttpUrl(text)) {
    return text;
  }

  const match = text.match(URL_IN_TEXT);
  if (match && isHttpUrl(match[0])) {
    return match[0];
  }

  // Shared text with no link in it — a plain note, a phone number, a search. Returning null
  // leaves the form empty and visibly unfilled, which is the honest outcome: there is nothing
  // to import. Never guess a URL.
  return null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  }
  catch {
    return false;
  }
}
