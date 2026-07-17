import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  FIRST_LOAD_PAGE_COUNT,
  LIST_PAGE_SIZE,
  cookbookListScope,
  flushListCache,
  getCachedCookbook,
  getCachedList,
  isListFresh,
  listCacheKey,
  resolveListParams,
  sameList,
  storeCachedCookbook,
  storeCachedList,
} from "./use-list-cache";
import type { ReadCookBook } from "~/lib/api/types/cookbook";
import type { Recipe } from "~/lib/api/types/recipe";

const recipe = (id: string, updatedAt = "2026-07-16T00:00:00") => ({ id, updatedAt }) as Recipe;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-16T12:00:00"));
});

afterEach(() => {
  flushListCache();
  vi.useRealTimers();
});

describe("resolveListParams + listCacheKey", () => {
  const prefs = { orderBy: "created_at", orderDirection: "desc" };

  /**
   * THE INVARIANT THE FEATURE STANDS ON. The grid and the prefetcher call this same resolver
   * with the same inputs; the keys must be identical or the prefetcher stores under a key the
   * page never looks up — prefetch-into-nothing, silently, while looking implemented.
   */
  test("same inputs, same key — the page/prefetch identity", () => {
    const scope = cookbookListScope(true, "home", "dinner");
    const params = () =>
      resolveListParams({ cookbook: "dinner" }, prefs.orderBy, prefs.orderDirection, null, LIST_PAGE_SIZE * FIRST_LOAD_PAGE_COUNT, "");
    expect(listCacheKey(scope, params())).toBe(listCacheKey(scope, params()));
    expect(listCacheKey(scope, params())).not.toBeNull();
  });

  test("different sort, different key — sorted views never cross-contaminate", () => {
    const scope = cookbookListScope(true, "home", "dinner");
    const a = resolveListParams({ cookbook: "dinner" }, "created_at", "desc", null, 64, "");
    const b = resolveListParams({ cookbook: "dinner" }, "name", "asc", null, 64, "");
    expect(listCacheKey(scope, a)).not.toBe(listCacheKey(scope, b));
  });

  test("authed and public scopes never share an entry — households can differ", () => {
    expect(cookbookListScope(true, "home", "dinner")).not.toBe(cookbookListScope(false, "home", "dinner"));
  });

  test("random ordering is uncacheable by design — its seed exists to differ per visit", () => {
    const scope = cookbookListScope(true, "home", "dinner");
    const params = resolveListParams({ cookbook: "dinner" }, "random", "desc", null, 64, "12345");
    expect(listCacheKey(scope, params)).toBeNull();
  });

  test("preserves the original null-position quirk verbatim", () => {
    // `(query?.orderByNullPosition || dir === "asc") ? "first" : "last"` — a query-supplied
    // "last" still resolves to "first". Odd, but it is what every fetch has always sent, and
    // changing every list request on the site is not this feature's call.
    expect(resolveListParams({ orderByNullPosition: "last" }, "name", "desc", null, 64, "").orderByNullPosition).toBe("first");
    expect(resolveListParams(null, "name", "asc", null, 64, "").orderByNullPosition).toBe("first");
    expect(resolveListParams(null, "name", "desc", null, 64, "").orderByNullPosition).toBe("last");
  });
});

describe("list store", () => {
  test("stores and retrieves under a key", () => {
    storeCachedList("k1", [recipe("a")], true);
    expect(getCachedList("k1")?.recipes.map(r => r.id)).toEqual(["a"]);
    expect(getCachedList("k1")?.hasMore).toBe(true);
    expect(getCachedList("nope")).toBeNull();
  });

  test("LRU-capped: the oldest entry falls out, a re-stored entry is young again", () => {
    for (let i = 0; i < 10; i++) {
      storeCachedList(`k${i}`, [recipe(`${i}`)], false);
    }
    storeCachedList("k0", [recipe("0")], false); // touch k0 -> k1 is now oldest
    storeCachedList("k10", [recipe("10")], false); // push one over the cap
    expect(getCachedList("k1")).toBeNull();
    expect(getCachedList("k0")).not.toBeNull();
    expect(getCachedList("k10")).not.toBeNull();
  });

  test("flush drops everything — lists and cookbooks", () => {
    storeCachedList("k1", [recipe("a")], false);
    storeCachedCookbook("cb1", { id: "x" } as ReadCookBook);
    flushListCache();
    expect(getCachedList("k1")).toBeNull();
    expect(getCachedCookbook("cb1")).toBeNull();
  });

  test("freshness gates re-warming, not serving", () => {
    storeCachedList("k1", [recipe("a")], false);
    expect(isListFresh("k1")).toBe(true);
    vi.advanceTimersByTime(31_000);
    expect(isListFresh("k1")).toBe(false); // a hover would re-warm now
    expect(getCachedList("k1")).not.toBeNull(); // but the entry still serves instantly
  });
});

describe("sameList — 'swap only if changed'", () => {
  test("identical result skips the swap — revalidation must not reflow an unchanged grid", () => {
    const a = [recipe("a"), recipe("b")];
    const b = [recipe("a"), recipe("b")];
    expect(sameList(a, b)).toBe(true);
  });

  test("an edit, a removal, an addition, or a reorder each force the swap", () => {
    const base = [recipe("a"), recipe("b")];
    expect(sameList(base, [recipe("a"), recipe("b", "2026-07-16T09:00:00")])).toBe(false); // edited
    expect(sameList(base, [recipe("a")])).toBe(false); // removed (the unfile-vanish case)
    expect(sameList(base, [recipe("a"), recipe("b"), recipe("c")])).toBe(false); // added
    expect(sameList(base, [recipe("b"), recipe("a")])).toBe(false); // reordered
  });
});
