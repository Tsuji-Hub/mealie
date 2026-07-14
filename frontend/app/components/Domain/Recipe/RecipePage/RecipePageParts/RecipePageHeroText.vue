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
import { usePageState } from "~/composables/recipe-page/shared-state";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe, RecipeCategory, RecipeTag, RecipeTool } from "~/lib/api/types/recipe";

const props = defineProps<{ recipe: NoUndefinedField<Recipe> }>();

const route = useRoute();
const router = useRouter();
const auth = useMealieAuth();
const { isEditMode } = usePageState(props.recipe.slug);

const groupSlug = computed(
  () => (route.params.groupSlug as string) || auth.user?.value?.groupSlug || "",
);

const hasOrganizers = computed(
  () => props.recipe.recipeCategory.length > 0 || props.recipe.tags.length > 0,
);

function chipClicked(item: RecipeCategory | RecipeTag | RecipeTool, urlPrefix?: string) {
  if (!item.id) {
    return;
  }
  router.push(`/g/${groupSlug.value}?${urlPrefix}=${item.id}`);
}
</script>
