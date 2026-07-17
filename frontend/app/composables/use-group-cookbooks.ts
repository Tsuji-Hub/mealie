import { usePublicExploreApi } from "./api/api-client";
import { useUserApi } from "~/composables/api";
import {
  cookbookCacheKey,
  getCachedCookbook,
  storeCachedCookbook,
} from "~/composables/recipes/use-list-cache";
import type { ReadCookBook } from "~/lib/api/types/cookbook";

export const useCookbook = function (publicGroupSlug: string | null = null) {
  function getOne(id: string | number) {
    // passing the group slug switches to using the public API
    const api = publicGroupSlug ? usePublicExploreApi(publicGroupSlug).explore : useUserApi();

    // SWR keyed by the cookbook itself. This used to be useAsyncData under a RANDOM key
    // (useAsyncKey), so a revisit could never find the previous visit's data and the header
    // re-skeletoned every time. Now a revisit starts from the cached cookbook, and the fetch
    // below silently corrects it if the cookbook changed.
    const key = cookbookCacheKey(publicGroupSlug ?? "own", id);
    const book = ref<ReadCookBook | null>(getCachedCookbook(key));

    api.cookbooks.getOne(id).then(({ data }) => {
      if (data) {
        storeCachedCookbook(key, data);
        book.value = data;
      }
    });

    return book;
  }

  return { getOne };
};
