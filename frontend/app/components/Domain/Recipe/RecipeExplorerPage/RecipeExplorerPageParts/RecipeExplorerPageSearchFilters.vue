<template>
  <!-- Category filter, labelled "Cookbooks" on the browsing path: every category here is
       1:1 with a cookbook of the same name, and that is the word Ethan thinks in.
       Binds the EXISTING cookbook.cookbooks key rather than renaming category.categories —
       that key is shared with the cookbook editor, meal-plan rules, Data Management and the
       categories admin page, where a category genuinely is a category. Renaming its value
       would put "Cookbooks" inside the cookbook editor. -->
  <SearchFilter
    v-if="categories"
    v-model="selectedCategories"
    v-model:require-all="state.requireAllCategories"
    :items="categories"
  >
    <v-icon start>
      {{ $globals.icons.categories }}
    </v-icon>
    {{ $t("cookbook.cookbooks") }}
  </SearchFilter>

  <!-- Tag Filter -->
  <SearchFilter
    v-if="tags"
    v-model="selectedTags"
    v-model:require-all="state.requireAllTags"
    :items="tags"
  >
    <v-icon start>
      {{ $globals.icons.tags }}
    </v-icon>
    {{ $t("tag.tags") }}
  </SearchFilter>

  <!-- Tool Filter -->
  <SearchFilter
    v-if="tools"
    v-model="selectedTools"
    v-model:require-all="state.requireAllTools"
    :items="tools"
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
} = useRecipeExplorerSearch(groupSlug);

const { store: categories } = isOwnGroup.value ? useCategoryStore() : usePublicCategoryStore(groupSlug.value);
const { store: tags } = isOwnGroup.value ? useTagStore() : usePublicTagStore(groupSlug.value);
const { store: tools } = isOwnGroup.value ? useToolStore() : usePublicToolStore(groupSlug.value);
// Lazy, and hydrated by the filter's @open above. The store is module-scoped, so this and the
// one in use-recipe-explorer-search share `initialized` — whichever fires first pays, once.
const { store: foods, actions: foodActions } = isOwnGroup.value
  ? useFoodStore(undefined, { lazy: true })
  : usePublicFoodStore(groupSlug.value, undefined, { lazy: true });
const { store: households } = isOwnGroup.value ? useHouseholdStore() : usePublicHouseholdStore(groupSlug.value);

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
