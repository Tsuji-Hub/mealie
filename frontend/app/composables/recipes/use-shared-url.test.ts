import { describe, expect, test } from "vitest";
import { extractSharedUrl } from "./use-shared-url";

describe("extractSharedUrl", () => {
  /**
   * THE ONE THAT MATTERS. This is Ethan's actual habit: he is in TikTok, hits Share, taps Mealie.
   * TikTok sends prose with the link inside it and no `url` field at all. Requiring the text to
   * BE a URL leaves the form empty — and it fails silently, so the share looks like it worked.
   */
  test("REGRESSION: TikTok shares prose with the link embedded", () => {
    expect(
      extractSharedUrl(null, "Check out this video on TikTok https://vm.tiktok.com/ZM1abc/"),
    ).toBe("https://vm.tiktok.com/ZM1abc/");
  });

  test("the other TikTok share shapes", () => {
    // Title-then-link, with the link at the end and trailing text after it.
    expect(
      extractSharedUrl(
        null,
        "60 second high protein pizza bowl #recipe https://www.tiktok.com/t/ZP8kQmxyz/ check it out",
      ),
    ).toBe("https://www.tiktok.com/t/ZP8kQmxyz/");

    // Link first, prose after.
    expect(extractSharedUrl(null, "https://vm.tiktok.com/ZM1abc/ - saw this, looks good")).toBe(
      "https://vm.tiktok.com/ZM1abc/",
    );
  });

  test("the url field wins when present — Chrome sharing a page needs no parsing", () => {
    expect(
      extractSharedUrl("https://www.skinnytaste.com/some-recipe/", "Some Recipe - Skinnytaste"),
    ).toBe("https://www.skinnytaste.com/some-recipe/");
  });

  test("a plain recipe-site URL shared as text", () => {
    expect(extractSharedUrl(null, "https://www.skinnytaste.com/some-recipe/")).toBe(
      "https://www.skinnytaste.com/some-recipe/",
    );
    expect(extractSharedUrl("", "  https://flexibledietinglifestyle.com/recipe/  ")).toBe(
      "https://flexibledietinglifestyle.com/recipe/",
    );
  });

  test("keeps query strings and fragments — dropping them changes the recipe", () => {
    expect(extractSharedUrl(null, "look https://example.com/r?id=12&page=2#steps here")).toBe(
      "https://example.com/r?id=12&page=2#steps",
    );
  });

  test("does not swallow a sentence's punctuation into the URL", () => {
    // A trailing "." silently breaks the scrape, and prose ends in punctuation constantly.
    expect(extractSharedUrl(null, "try this https://example.com/recipe.")).toBe(
      "https://example.com/recipe",
    );
    expect(extractSharedUrl(null, "this one (https://example.com/recipe), it's good")).toBe(
      "https://example.com/recipe",
    );
    expect(extractSharedUrl(null, "https://example.com/recipe!")).toBe("https://example.com/recipe");
  });

  test("a text field that is exactly a URL keeps its trailing bracket", () => {
    // Real URLs do end in ")" — wikipedia-style. Only safe because nothing follows it.
    expect(extractSharedUrl(null, "https://en.wikipedia.org/wiki/Ragù_(sauce)")).toBe(
      "https://en.wikipedia.org/wiki/Ragù_(sauce)",
    );
  });

  test("takes the first link when the text has several", () => {
    expect(extractSharedUrl(null, "https://example.com/a and also https://example.com/b")).toBe(
      "https://example.com/a",
    );
  });

  /** "Share something with no URL in it → fails gracefully, no empty recipe created." */
  test("no link in the share means null — never guess a URL", () => {
    expect(extractSharedUrl(null, "remind me to make mom's lasagna")).toBeNull();
    expect(extractSharedUrl(null, "")).toBeNull();
    expect(extractSharedUrl(null, "   ")).toBeNull();
    expect(extractSharedUrl(null, null)).toBeNull();
    expect(extractSharedUrl(undefined, undefined)).toBeNull();
  });

  test("non-http schemes are not URLs we can scrape", () => {
    expect(extractSharedUrl(null, "mailto:someone@example.com")).toBeNull();
    expect(extractSharedUrl(null, "javascript:alert(1)")).toBeNull();
    expect(extractSharedUrl(null, "tel:+15555555555")).toBeNull();
    // ...but a real link later in the same text is still found.
    expect(extractSharedUrl(null, "mailto:a@b.com or https://example.com/recipe")).toBe(
      "https://example.com/recipe",
    );
  });

  test("a bare domain with no scheme is not extracted", () => {
    // Ambiguous, and guessing https:// on arbitrary shared text invents a URL the user never sent.
    expect(extractSharedUrl(null, "check out example.com/recipe")).toBeNull();
  });
});
