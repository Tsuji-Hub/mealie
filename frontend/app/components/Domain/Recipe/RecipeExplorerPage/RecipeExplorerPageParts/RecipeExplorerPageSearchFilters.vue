<template>
  <!-- Category filter, labelled "Cookbooks" on the browsing path: every category here is
       1:1 with a cookbook of the same name, and that is the word Ethan thinks in.
       Binds the EXISTING cookbook.cookbooks key rather than renaming category.categories —
       that key is shared with the cookbook editor, meal-plan rules, Data Management and the
       categories admin page, where a category genuinely is a category. Renaming its value
       would put "Cookbooks" inside the cookbook editor. -->
  <SearchFilter
    v-if="categoryOptions"
    v-model="selectedCategories"
    v-model:require-all="state.requireAllCategories"
    :items="categoryOptions"
    @open="categoryActions.hydrate()"
  >
    <v-icon start>
      {{ $globals.icons.categories }}
    </v-icon>
    {{ $t("cookbook.cookbooks") }}
  </SearchFilter>

  <!-- Tag Filter -->
  <SearchFilter
    v-if="tagOptions"
    v-model="selectedTags"
    v-model:require-all="state.requireAllTags"
    :items="tagOptions"
    @open="tagActions.hydrate()"
  >
    <v-icon start>
      {{ $globals.icons.tags }}
    </v-icon>
    {{ $t("tag.tags") }}
  </SearchFilter>

  <!-- Tool Filter -->
  <SearchFilter
    v-if="toolOptions"
    v-model="selectedTools"
    v-model:require-all="state.requireAllTools"
    :items="toolOptions"
    @open="toolActions.hydrate()"
  >
    <v-icon start>
      {{ $globals.icons.potSteam }}
    </v-icon>
    {{ $t("tool.tools") }}
  </SearchFilter>

  <!-- Food Filter. Its 2687 rows are fetched when the menu opens, not when the page renders —
       that one request was 1.2 MB and 15x the rest of the page combined. -->
  <SearchFilter
    v-if="foods"
    v-model="selectedFoods"
    v-model:require-all="state.requireAllFoods"
    :items="foods"
    @open="foodActions.hydrate()"
  >
    <v-icon start>
      {{ $globals.icons.foods }}
    </v-icon>
    {{ $t("general.foods") }}
  </SearchFilter>

  <!-- Household Filter -->
  <SearchFilter
    v-if="households.length > 1"
    v-model="selectedHouseholds"
    :items="households"
    radio
  >
    <v-icon start>
      {{ $globals.icons.household }}
    </v-icon>
    {{ $t("household.households") }}
  </SearchFilter>
</template>

<script setup lang="ts">
import { useLoggedInState } from "~/composables/use-logged-in-state";
import { useRecipeExplorerSearch } from "~/composables/use-recipe-explorer-search";
import {
  useCategoryStore,
  usePublicCategoryStore,
  useFoodStore,
  usePublicFoodStore,
  useHouseholdStore,
  usePublicHouseholdStore,
  useTagStore,
  usePublicTagStore,
  useToolStore,
  usePublicToolStore,
} from "~/composables/store";
import { watchDebounced } from "@vueuse/core";
import { useUserApi } from "~/composables/api";
import { usePublicExploreApi } from "~/composables/api/api-client";
import { facetOptions, facetQueryOf } from "~/composables/recipes/use-facets";
import type { RecipeFacets } from "~/lib/api/types/non-generated";

const auth = useMealieAuth();
const route = useRoute();

const { isOwnGroup } = useLoggedInState();
const groupSlug = computed(() => route.params.groupSlug as string || auth.user.value?.groupSlug || "");

const {
  state,
  selectedCategories,
  selectedFoods,
  selectedHouseholds,
  selectedTags,
  selectedTools,
  passedQueryWithSeed,
} = useRecipeExplorerSearch(groupSlug);

// The global stores are the FALLBACK, not the source: option lists come from the facets
// endpoint below; the stores only serve when facets fail, and resolve deep-link chips. ALL
// lazy since the 2026-08-10 access-log storm showed each eager construction firing its
// unbounded perPage=-1 fetch on every installed-app cold launch. Hydrated by each filter's
// @open (the foods pattern, generalized) — the stores are module-scoped, so these and the
// ones in use-recipe-explorer-search share `initialized`; whichever fires first pays, once.
const { store: categories, actions: categoryActions } = isOwnGroup.value
  ? useCategoryStore(undefined, { lazy: true })
  : usePublicCategoryStore(groupSlug.value, undefined, { lazy: true });
const { store: tags, actions: tagActions } = isOwnGroup.value
  ? useTagStore(undefined, { lazy: true })
  : usePublicTagStore(groupSlug.value, undefined, { lazy: true });
const { store: tools, actions: toolActions } = isOwnGroup.value
  ? useToolStore(undefined, { lazy: true })
  : usePublicToolStore(groupSlug.value, undefined, { lazy: true });
const { store: foods, actions: foodActions } = isOwnGroup.value
  ? useFoodStore(undefined, { lazy: true })
  : usePublicFoodStore(groupSlug.value, undefined, { lazy: true });
const { store: households, actions: householdActions } = isOwnGroup.value
  ? useHouseholdStore(undefined, { lazy: true })
  : usePublicHouseholdStore(groupSlug.value, undefined, { lazy: true });

// The household filter is the one selector whose VISIBILITY depends on store rows
// (`v-if="households.length > 1"` — no facet source), so a never-hydrated store would hide it
// forever. Hydrate at idle: off the launch critical path, present a moment later.
onMounted(() => {
  type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  const idle = (window as IdleWindow).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
  idle(() => { householdActions.hydrate(); }, { timeout: 4000 });
});

// ---- Facets: only offer an option if choosing it would return something ------------------
const api = useUserApi();
const publicApi = isOwnGroup.value ? null : usePublicExploreApi(groupSlug.value).explore;

const facets = ref<RecipeFacets | null>(null);

// Set-membership params only: the random seed and ordering change nothing about WHICH recipes
// are in scope, and refetching on every reshuffle would be noise.
const facetQuery = computed(() => facetQueryOf(passedQueryWithSeed.value));

async function fetchFacets() {
  try {
    const { data, error } = publicApi
      ? await publicApi.recipes.getFacets(facetQuery.value)
      : await api.recipes.getFacets(facetQuery.value);
    facets.value = error ? null : data;
  }
  catch {
    // Degrade, never break the page: null routes every selector to its global-store fallback.
    facets.value = null;
  }
}

// Debounced: the search box types fast, and every keystroke changes the query.
watchDebounced(facetQuery, fetchFacets, { debounce: 300, deep: true, immediate: true });

const tagOptions = computed(() =>
  facetOptions(facets.value?.tags, facets.value?.ok ?? false, selectedTags.value, tags.value),
);
const categoryOptions = computed(() =>
  facetOptions(facets.value?.categories, facets.value?.ok ?? false, selectedCategories.value, categories.value),
);
const toolOptions = computed(() =>
  facetOptions(facets.value?.tools, facets.value?.ok ?? false, selectedTools.value, tools.value),
);

watch(
  households,
  () => {
    // if exactly one household exists, then we shouldn't be filtering by household
    if (households.value.length == 1) {
      selectedHouseholds.value = [];
    }
  },
);
</script>
