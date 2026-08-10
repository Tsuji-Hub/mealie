import type { Composer } from "vue-i18n";
import { useData, useReadOnlyStore, useStore } from "../partials/use-store-factory";
import type { StoreOptions } from "../partials/use-store-factory";
import type { IngredientFood } from "~/lib/api/types/recipe";
import { usePublicExploreApi, useUserApi } from "~/composables/api";

const store: Ref<IngredientFood[]> = ref([]);
const loading = ref(false);
const initialized = ref(false);
const publicLoading = ref(false);
const publicInitialized = ref(false);

export function resetFoodStore() {
  store.value = [];
  loading.value = false;
  initialized.value = false;
  publicLoading.value = false;
  publicInitialized.value = false;
}

export const useFoodData = function () {
  return useData<IngredientFood>({
    id: "",
    name: "",
    description: "",
    labelId: undefined,
  });
};

// Foods was the first store to go lazy (2687 rows, 1.2 MB, ~1.3 s). Pass `{ lazy: true }`
// where you only need a reference to the store and not its rows, then call
// `actions.hydrate()` at the point the rows are actually shown. The rest of the organizer
// stores followed on 2026-08-10: "47-64 ms and stay eager" was a LAN number for a warm tab —
// the installed PWA cold-starts every launch and paid all six unbounded fetches every time.
export const useFoodStore = function (i18n?: Composer, options: StoreOptions = {}) {
  const api = useUserApi(i18n);
  return useStore<IngredientFood>("food", store, loading, initialized, api.foods, {}, options);
};

export const usePublicFoodStore = function (groupSlug: string, i18n?: Composer, options: StoreOptions = {}) {
  const api = usePublicExploreApi(groupSlug, i18n).explore;
  return useReadOnlyStore<IngredientFood>("food", store, publicLoading, publicInitialized, api.foods, {}, options);
};
