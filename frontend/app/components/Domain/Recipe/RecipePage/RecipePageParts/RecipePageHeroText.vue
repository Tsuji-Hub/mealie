<template>
  <div>
    <!-- Identity chips: clickable navigation, colored per taxonomy hue -->
    <div v-if="!isEditMode && hasOrganizers" class="d-flex flex-wrap mb-3">
      <RecipeChips
        small
        :items="recipe.recipeCategory"
        url-prefix="categories"
        @item-selected="chipClicked"
        @item-hovered="chipHovered"
      />
      <RecipeChips
        small
        :items="recipe.tags"
        url-prefix="tags"
        @item-selected="chipClicked"
        @item-hovered="chipHovered"
      />
    </div>

    <h1 class="fork-hero-title text-wrap">
      {{ recipe.name }}
    </h1>
  </div>
</template>

<script setup lang="ts">
import RecipeChips from "~/components/Domain/Recipe/RecipeChips.vue";
import { cookbookForCategory, organizerRoute } from "~/composables/cookbooks/use-cookbook-scope";
import { useCookbookPrefetch } from "~/composables/recipes/use-list-prefetch";
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

// Hovering (or touching) a pill warms the cookbook it routes to, so the click that follows
// paints cached cards. Same resolution as the click — cookbookForCategory — so the pill can
// only ever warm the page it would actually open.
const { hoverStart } = useCookbookPrefetch();
function chipHovered(item: RecipeCategory | RecipeTag | RecipeTool, urlPrefix?: string) {
  if (urlPrefix && urlPrefix !== "categories") {
    return;
  }
  const cookbook = cookbookForCategory(cookbooks.value, item as RecipeCategory);
  if (cookbook?.slug) {
    hoverStart(cookbook.slug);
  }
}
</script>
