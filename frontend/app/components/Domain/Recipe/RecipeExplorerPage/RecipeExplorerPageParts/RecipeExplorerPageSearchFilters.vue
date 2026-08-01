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

// The global stores are now the FALLBACK, not the source: bound directly, they offered every
// organiser in the group unconditionally — dessert-only tags inside the Dinner scope.
const { store: categories } = isOwnGroup.value ? useCategoryStore() : usePublicCategoryStore(groupSlug.value);
const { store: tags } = isOwnGroup.value ? useTagStore() : usePublicTagStore(groupSlug.value);
const { store: tools } = isOwnGroup.value ? useToolStore() : usePublicToolStore(groupSlug.value);
// Lazy, and hydrated by the filter's @open above. The store is module-scoped, so this and the
// one in use-recipe-explorer-search share `initialized` — whichever fires first pays, once.
const { store: foods, actions: foodActions } = isOwnGroup.value
  ? useFoodStore(undefined, { lazy: true })
  : usePublicFoodStore(groupSlug.value, undefined, { lazy: true });
const { store: households } = isOwnGroup.value ? useHouseholdStore() : usePublicHouseholdStore(groupSlug.value);

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
