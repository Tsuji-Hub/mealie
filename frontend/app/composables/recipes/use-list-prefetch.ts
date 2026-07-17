import { useLazyRecipes } from "./use-recipes";
import {
  FIRST_LOAD_PAGE_COUNT,
  LIST_PAGE_SIZE,
  cookbookCacheKey,
  cookbookListScope,
  getCachedCookbook,
  isListFresh,
  listCacheKey,
  resolveListParams,
  storeCachedCookbook,
  storeCachedList,
} from "./use-list-cache";
import { usePublicExploreApi } from "~/composables/api/api-client";
import { useUserApi } from "~/composables/api";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import { useUserSortPreferences } from "~/composables/use-users/preferences";

/** Hover this long before spending a fetch — a pointer sweeping the sidebar is not intent. */
const HOVER_INTENT_MS = 150;

/**
 * Warm the SWR cache for a cookbook before the user clicks it, so the click paints real cards
 * with no skeletons at all.
 *
 * The fetch parameters come from the SAME resolver the destination grid uses (resolveListParams)
 * with the same doubled first-page size — that identity is the entire feature. If this built its
 * own params, any drift would store under a key the page never reads, and prefetch would silently
 * do nothing while looking implemented.
 */
export function useCookbookPrefetch() {
  const route = useRoute();
  const auth = useMealieAuth();
  const { isOwnGroup } = useLoggedInState();
  const preferences = useUserSortPreferences();

  const groupSlug = computed(
    () => (route.params.groupSlug as string) || auth.user.value?.groupSlug || "",
  );
  const publicSlug = isOwnGroup.value ? null : groupSlug.value;

  const api = publicSlug ? usePublicExploreApi(publicSlug).explore : useUserApi();
  const { fetchMore } = useLazyRecipes(publicSlug);

  const hoverTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Set<string>();

  async function warm(cookbookSlug: string) {
    if (!cookbookSlug || inFlight.has(cookbookSlug)) {
      return;
    }

    // The cookbook payload (header + vanish predicate) — tiny, fetch if not already cached.
    const bookKey = cookbookCacheKey(publicSlug ?? "own", cookbookSlug);
    if (!getCachedCookbook(bookKey)) {
      api.cookbooks.getOne(cookbookSlug).then(({ data }) => {
        if (data) {
          storeCachedCookbook(bookKey, data);
        }
      });
    }

    // The recipes list — same params, same doubled page size, same key as the grid's own fetch.
    const params = resolveListParams(
      { cookbook: cookbookSlug },
      preferences.value.orderBy,
      preferences.value.orderDirection,
      null,
      LIST_PAGE_SIZE * FIRST_LOAD_PAGE_COUNT,
      "",
    );
    const key = listCacheKey(cookbookListScope(isOwnGroup.value, groupSlug.value, cookbookSlug), params);
    if (!key || isListFresh(key)) {
      return;
    }

    inFlight.add(cookbookSlug);
    try {
      const recipes = await fetchMore(
        1,
        params.perPage,
        params.orderBy,
        params.orderDirection,
        params.orderByNullPosition,
        params.query,
        params.queryFilter,
      );
      storeCachedList(key, recipes, recipes.length >= LIST_PAGE_SIZE);
    }
    finally {
      inFlight.delete(cookbookSlug);
    }
  }

  /** Desktop: warm after a dwell, so sweeping the pointer down the sidebar fires nothing. */
  function hoverStart(cookbookSlug: string) {
    hoverEnd(cookbookSlug);
    hoverTimers.set(
      cookbookSlug,
      setTimeout(() => {
        hoverTimers.delete(cookbookSlug);
        warm(cookbookSlug);
      }, HOVER_INTENT_MS),
    );
  }

  function hoverEnd(cookbookSlug: string) {
    const timer = hoverTimers.get(cookbookSlug);
    if (timer) {
      clearTimeout(timer);
      hoverTimers.delete(cookbookSlug);
    }
  }

  /** Phone: touchstart fires only on the item under the finger, so warm immediately — the
   * ~100ms until the click commits is free overlap. */
  function touchStart(cookbookSlug: string) {
    warm(cookbookSlug);
  }

  onBeforeUnmount(() => {
    hoverTimers.forEach(timer => clearTimeout(timer));
    hoverTimers.clear();
  });

  return { warm, hoverStart, hoverEnd, touchStart };
}
