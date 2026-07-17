<template>
  <div>
    <!-- Identity chips: clickable navigation, colored per taxonomy hue -->
    <div v-if="!isEditMode && hasOrganizers" class="d-flex flex-wrap mb-3">
      <RecipeChips
        small
        :items="recipe.recipeCategory"
        url-prefix="categories"
        @item-selected="chipClicked"
      />
      <RecipeChips
        small
        :items="recipe.tags"
        url-prefix="tags"
        @item-selected="chipClicked"
      />
    </div>

    <h1 class="fork-hero-title text-wrap">
      {{ recipe.name }}
    </h1>
  </div>
</template>

<script setup lang="ts">
import RecipeChips from "~/components/Domain/Recipe/RecipeChips.vue";
import { organizerRoute } from "~/composables/cookbooks/use-cookbook-scope";
import { usePageState } from "~/composables/recipe-page/shared-state";
import { useCookbookStore, usePublicCookbookStore } from "~/composables/store/use-cookbook-store";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe, RecipeCategory, RecipeTag, RecipeTool } from "~/lib/api/types/recipe";

const props = defineProps<{ recipe: NoUndefinedField<Recipe> }>();

const route = useRoute();
const router = useRouter();
const auth = useMealieAuth();
const { isOwnGroup } = useLoggedInState();
const { isEditMode } = usePageState(props.recipe.slug);

const groupSlug = computed(
  () => (route.params.groupSlug as string) || auth.user?.value?.groupSlug || "",
);

// Already hydrated by the sidebar — the category -> cookbook lookup costs no fetch.
const { store: cookbooks } = isOwnGroup.value
  ? useCookbookStore()
  : usePublicCookbookStore(groupSlug.value);

const hasOrganizers = computed(
  () => props.recipe.recipeCategory.length > 0 || props.recipe.tags.length > 0,
);

// A category pill reads as a cookbook tag, so it routes to that cookbook's page — the instant
// path — rather than to the search explorer with a filter chip. Tags, and any category without
// a matching cookbook, keep the explorer link.
function chipClicked(item: RecipeCategory | RecipeTag | RecipeTool, urlPrefix?: string) {
  if (!item.id) {
    return;
  }
  router.push(organizerRoute(groupSlug.value, item, urlPrefix ?? "categories", cookbooks.value));
}
</script>
