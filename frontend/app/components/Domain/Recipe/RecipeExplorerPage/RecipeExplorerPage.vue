<template>
  <v-container
    fluid
    class="px-0"
  >
    <RecipeExplorerPageSearch
      ref="searchComponent"
      @ready="onSearchReady"
    />
    <v-divider />
    <v-container class="mt-6 px-md-6">
      <RecipeCardSection
        v-if="ready"
        class="mt-n5"
        :icon="$globals.icons.silverwareForkKnife"
        :title="$t('general.recipes')"
        :recipes="recipes"
        :query="searchQuery"
        disable-sort
        @item-selected="onItemSelected"
        @replace-recipes="replaceRecipes"
        @append-recipes="appendRecipes"
      />
      <!-- The gate above stays (mounting the section before the search query is initialized
           would fire a throwaway fetch), but waiting must not mean a blank page: skeletons
           hold the layout until the section mounts and takes over with its own. -->
      <RecipeCardSkeletonGrid v-else class="mt-n5" />
    </v-container>
  </v-container>
</template>

<script setup lang="ts">
import RecipeExplorerPageSearch from "./RecipeExplorerPageParts/RecipeExplorerPageSearch.vue";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import RecipeCardSection from "~/components/Domain/Recipe/RecipeCardSection.vue";
import RecipeCardSkeletonGrid from "~/components/Domain/Recipe/RecipeCardSkeletonGrid.vue";
import { useLazyRecipes } from "~/composables/recipes";

const auth = useMealieAuth();
const route = useRoute();

const { isOwnGroup } = useLoggedInState();
const groupSlug = computed(() => route.params.groupSlug as string || auth.user.value?.groupSlug || "");

const { recipes, appendRecipes, replaceRecipes } = useLazyRecipes(isOwnGroup.value ? null : groupSlug.value);

const ready = ref(false);
const searchComponent = ref<InstanceType<typeof RecipeExplorerPageSearch>>();

const searchQuery = computed(() => {
  return searchComponent.value?.passedQueryWithSeed || {};
});

function onSearchReady() {
  ready.value = true;
}

function onItemSelected(item: any, urlPrefix: string) {
  searchComponent.value?.filterItems(item, urlPrefix);
}
</script>
