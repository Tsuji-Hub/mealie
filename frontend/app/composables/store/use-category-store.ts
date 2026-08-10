import type { Composer } from "vue-i18n";
import { useData, useReadOnlyStore, useStore } from "../partials/use-store-factory";
import type { StoreOptions } from "../partials/use-store-factory";
import type { RecipeCategory } from "~/lib/api/types/recipe";
import { usePublicExploreApi, useUserApi } from "~/composables/api";

const store: Ref<RecipeCategory[]> = ref([]);
const loading = ref(false);
const initialized = ref(false);
const publicLoading = ref(false);
const publicInitialized = ref(false);

export function resetCategoryStore() {
  store.value = [];
  loading.value = false;
  initialized.value = false;
  publicLoading.value = false;
  publicInitialized.value = false;
}

export const useCategoryData = function () {
  return useData<RecipeCategory>({
    id: "",
    name: "",
    slug: "",
  });
};

// Fork: `options.lazy` supported — the launch path constructs this store from several places
// (card category menus, the explorer search) and every construction used to fire the
// unbounded perPage=-1 fetch on every installed-app cold start. Launch-path callers pass
// { lazy: true } and hydrate when the rows are actually shown.
export const useCategoryStore = function (i18n?: Composer, options: StoreOptions = {}) {
  const api = useUserApi(i18n);
  return useStore<RecipeCategory>("category", store, loading, initialized, api.categories, {}, options);
};

export const usePublicCategoryStore = function (groupSlug: string, i18n?: Composer, options: StoreOptions = {}) {
  const api = usePublicExploreApi(groupSlug, i18n).explore;
  return useReadOnlyStore<RecipeCategory>("category", store, publicLoading, publicInitialized, api.categories, {}, options);
};
