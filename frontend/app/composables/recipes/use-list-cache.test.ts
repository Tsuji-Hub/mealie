import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  FIRST_LOAD_PAGE_COUNT,
  LIST_PAGE_SIZE,
  bindPersistedListCache,
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

describe("cold-start persistence — the standalone-PWA fix", () => {
  /** Unique per test: bindPersistedListCache is idempotent per user id (module singleton). */
  let n = 0;
  const uid = () => `user-${++n}-${Math.random().toString(36).slice(2, 8)}`;
  const KEY = "fork.listCache.v1";

  afterEach(() => {
    window.localStorage.clear();
  });

  test("a stored list persists and re-seeds after 'process death' (cache flushed in-memory only)", () => {
    const who = uid();
    bindPersistedListCache(who);
    storeCachedList("pk1", [recipe("a"), recipe("b")], true);
    vi.advanceTimersByTime(1000); // debounce
    const blob = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(blob.who).toBe(who);
    expect(blob.lists.find(([k]: [string]) => k === "pk1")).toBeTruthy();

    // Simulate the next launch: memory empty, same user binds -> entry is back.
    // (flushListCache would clear disk too — that is sign-out, not process death.)
    const saved = window.localStorage.getItem(KEY)!;
    flushListCache();
    window.localStorage.setItem(KEY, saved);
    expect(getCachedList("pk1")).toBeNull();
    bindPersistedListCache(uid()); // wrong user first: must NOT seed, must clear
    expect(getCachedList("pk1")).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  test("the same user re-binding after a cold start seeds the cache", () => {
    const who = uid();
    bindPersistedListCache(who);
    storeCachedList("pk2", [recipe("a")], false);
    storeCachedCookbook("pcb2", { id: "cb", slug: "dinner" } as ReadCookBook);
    vi.advanceTimersByTime(1000);
    const saved = window.localStorage.getItem(KEY)!;
    flushListCache();
    window.localStorage.setItem(KEY, saved);

    bindPersistedListCache(who + "-relaunch"); // fresh id simulating... no — must be SAME user
    expect(getCachedList("pk2")).toBeNull(); // mismatched id cleared it, proving the identity gate
    window.localStorage.setItem(KEY, saved);
    // A brand-new bind cannot reuse `who` (idempotence), so verify via a hand-built blob:
    const freshWho = uid();
    const blob = JSON.parse(saved);
    blob.who = freshWho;
    window.localStorage.setItem(KEY, JSON.stringify(blob));
    bindPersistedListCache(freshWho);
    expect(getCachedList("pk2")).not.toBeNull();
    expect(getCachedCookbook("pcb2")).not.toBeNull();
  });

  test("persisted lists are capped to the first-paint page count", () => {
    const who = uid();
    bindPersistedListCache(who);
    const many = Array.from({ length: 100 }, (_, i) => recipe(`r${i}`));
    storeCachedList("pk3", many, true);
    vi.advanceTimersByTime(1000);
    const blob = JSON.parse(window.localStorage.getItem(KEY)!);
    const [, entry] = blob.lists.find(([k]: [string]) => k === "pk3");
    expect(entry.recipes.length).toBe(LIST_PAGE_SIZE * FIRST_LOAD_PAGE_COUNT);
  });

  test("in-session entries beat the disk copy on bind", () => {
    const live = [recipe("live")];
    storeCachedList("pk4", live, false);
    const freshWho = uid();
    window.localStorage.setItem(KEY, JSON.stringify({
      v: 1, who: freshWho, lists: [["pk4", { recipes: [recipe("stale")], hasMore: false, storedAt: 1 }]], cookbooks: [],
    }));
    bindPersistedListCache(freshWho);
    expect(getCachedList("pk4")!.recipes[0]!.id).toBe("live");
  });

  test("flushListCache (sign-out, any mutation) clears the disk copy too", () => {
    const who = uid();
    bindPersistedListCache(who);
    storeCachedList("pk5", [recipe("a")], false);
    vi.advanceTimersByTime(1000);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    flushListCache();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  test("corrupt persisted data is discarded quietly", () => {
    window.localStorage.setItem(KEY, "{not json");
    bindPersistedListCache(uid());
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
