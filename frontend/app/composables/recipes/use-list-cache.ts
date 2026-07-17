import type { ReadCookBook } from "~/lib/api/types/cookbook";
import type { OrderByNullPosition, Recipe } from "~/lib/api/types/recipe";
import type { RecipeSearchQuery } from "~/lib/api/user/recipes/recipe";

/**
 * Stale-while-revalidate cache for the two payloads every grid navigation needs: the recipe
 * list for a query, and the cookbook a page is scoped to.
 *
 * Why it exists: every list route keyed its data with `useAsyncKey()` — a RANDOM key per page
 * instance — so nothing could ever find a previous visit's data, and every back-and-forth
 * navigation refetched and re-skeletoned a list that was already in memory a second ago. With
 * stable semantic keys, a revisit paints real cards immediately and revalidates in the
 * background; skeletons become a first-visit-only experience.
 *
 * Module-scoped on purpose (survives page unmounts, dies with the tab), LRU-capped by principle
 * (270 recipes could not fill a phone's memory; the cap is hygiene, not pressure).
 */

export interface CachedList {
  recipes: Recipe[];
  hasMore: boolean;
  storedAt: number;
}

const MAX_LIST_ENTRIES = 10;

/** One page of a grid fetch, and how many of them the first load requests (doubled to defeat
 * the large-screen no-scroll bug — see initRecipes). Exported so the prefetcher requests the
 * IDENTICAL shape; hard-coding 64 in two places is how the shapes drift apart. */
export const LIST_PAGE_SIZE = 32;
export const FIRST_LOAD_PAGE_COUNT = 2;

/** Entries newer than this are not worth re-warming from a hover. */
const PREFETCH_FRESH_MS = 30_000;

const listCache = new Map<string, CachedList>();
const cookbookCache = new Map<string, ReadCookBook>();

/** The exact parameters a list fetch resolves to — one shape shared by page and prefetch. */
export interface ResolvedListParams {
  orderBy: string | null;
  orderDirection: string;
  orderByNullPosition: OrderByNullPosition | null;
  query: RecipeSearchQuery | null;
  queryFilter: string | null;
  perPage: number;
}

/**
 * Resolve a grid's fetch parameters from its query + sort preferences.
 *
 * ONE resolver, used by both RecipeCardSection (the real fetch) and the prefetcher (the warm-up
 * fetch). They must not each derive these independently: any drift makes the prefetcher store
 * under a key the page never looks up, which silently turns prefetch back into
 * prefetch-into-nothing — the exact bug this feature replaces, minus the error message.
 */
export function resolveListParams(
  query: RecipeSearchQuery | null,
  prefOrderBy: string,
  prefOrderDirection: string,
  queryFilter: string | null,
  perPage: number,
  randomSeed: string,
): ResolvedListParams {
  const orderDirection = query?.orderDirection || prefOrderDirection;
  // Parenthesization preserved verbatim from the original fetch: `(a || b) ? "first" : "last"`,
  // i.e. a query-supplied null-position of "last" still resolves to "first". Surprising, but
  // changing it changes every list request on the site, which is not this feature's call.
  const orderByNullPosition: OrderByNullPosition = (query?.orderByNullPosition || orderDirection === "asc")
    ? "first"
    : "last";
  const orderBy = query?.orderBy || prefOrderBy;

  const localQuery: RecipeSearchQuery = { ...query };
  if (orderBy === "random") {
    localQuery._searchSeed = randomSeed;
  }

  return { orderBy, orderDirection, orderByNullPosition, query: localQuery, queryFilter, perPage };
}

/** The scope half of a list key: which API (authed vs public), which group, which cookbook. */
export function cookbookListScope(isOwnGroup: boolean, groupSlug: string, cookbookSlug: string): string {
  // Authed and public list routes can legitimately return different rows for the same query
  // (household filtering), so they must never share an entry.
  return `recipes:${isOwnGroup ? "own" : "pub"}:${groupSlug}:cookbook:${cookbookSlug}`;
}

/**
 * The cache key for a list request, or null when the request must not be cached.
 *
 * Built from the RESOLVED fetch parameters rather than from any page-local state, and used by
 * both the consuming page and the prefetcher — if the two built keys independently, any drift
 * between them would silently turn prefetch back into prefetch-into-nothing, which is the bug
 * this whole feature replaces.
 *
 * Random ordering is uncacheable by design: its seed exists to make every visit different.
 */
export function listCacheKey(groupScope: string, params: ResolvedListParams): string | null {
  if (params.orderBy === "random" || params.query?._searchSeed) {
    return null;
  }

  return JSON.stringify({
    g: groupScope,
    ob: params.orderBy,
    od: params.orderDirection,
    np: params.orderByNullPosition,
    q: params.query,
    qf: params.queryFilter,
    pp: params.perPage,
  });
}

export function getCachedList(key: string): CachedList | null {
  return listCache.get(key) ?? null;
}

export function storeCachedList(key: string, recipes: Recipe[], hasMore: boolean): void {
  // Refresh insertion order so the Map doubles as the LRU list.
  listCache.delete(key);
  listCache.set(key, { recipes, hasMore, storedAt: Date.now() });

  while (listCache.size > MAX_LIST_ENTRIES) {
    const oldest = listCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    listCache.delete(oldest);
  }
}

export function isListFresh(key: string): boolean {
  const entry = listCache.get(key);
  return !!entry && Date.now() - entry.storedAt < PREFETCH_FRESH_MS;
}

/**
 * Drop everything. Called on ANY recipe mutation — create, edit, delete, refile — rather than
 * surgically invalidating affected entries, because at this scale correctness beats cleverness:
 * a cached entry that survives the wrong mutation resurrects a card Ethan just unfiled, and a
 * flushed cache merely costs one skeleton on the next visit.
 */
export function flushListCache(): void {
  listCache.clear();
  cookbookCache.clear();
}

export function getCachedCookbook(key: string): ReadCookBook | null {
  return cookbookCache.get(key) ?? null;
}

export function storeCachedCookbook(key: string, cookbook: ReadCookBook): void {
  cookbookCache.set(key, cookbook);
  // Cookbook payloads are tiny; reuse the same cap for hygiene.
  while (cookbookCache.size > MAX_LIST_ENTRIES) {
    const oldest = cookbookCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cookbookCache.delete(oldest);
  }
}

export function cookbookCacheKey(groupScope: string, slugOrId: string | number): string {
  return `cookbook:${groupScope}:${slugOrId}`;
}

/**
 * Are two list results the same, for "swap only if changed"?
 *
 * Identity is the id sequence plus each row's update stamp: reorders, additions, removals and
 * edits all change it, while a byte-identical refetch matches and skips the re-render entirely —
 * the revalidation swap must never reflow a list that didn't change.
 */
export function sameList(a: Recipe[], b: Recipe[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id || stamp(a[i]!) !== stamp(b[i]!)) {
      return false;
    }
  }
  return true;
}

function stamp(recipe: Recipe): string {
  return `${recipe.updatedAt ?? ""}|${recipe.dateUpdated ?? ""}`;
}
