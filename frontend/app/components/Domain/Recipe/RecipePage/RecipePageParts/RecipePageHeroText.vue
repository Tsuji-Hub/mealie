<template>
  <div>
    <!-- Identity chips: clickable navigation, so chip styling is appropriate -->
    <div v-if="!isEditMode && hasOrganizers" class="d-flex flex-wrap mb-2">
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

    <h1 class="text-h5 font-weight-medium text-wrap opacity-90">
      {{ recipe.name }}
    </h1>

    <SafeMarkdown
      v-if="recipe.description"
      :source="recipe.description"
      class="mt-2 opacity-80"
    />

    <!-- One compact meta line: time (icon+text, static) and rating (only when rated) -->
    <div class="d-flex align-center flex-wrap ga-4 mt-2">
      <div v-if="timeDisplay" class="d-flex align-center" :title="timeTitle">
        <v-icon size="small" color="primary" class="mr-1">
          {{ $globals.icons.clockOutline }}
        </v-icon>
        <span class="text-body-2 opacity-80">{{ timeDisplay }}</span>
      </div>
      <RecipeRating
        v-if="recipe.rating"
        :key="recipe.slug"
        small
        :model-value="recipe.rating"
        :recipe-id="recipe.id"
        :slug="recipe.slug"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import RecipeChips from "~/components/Domain/Recipe/RecipeChips.vue";
import RecipeRating from "~/components/Domain/Recipe/RecipeRating.vue";
import { usePageState } from "~/composables/recipe-page/shared-state";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe, RecipeCategory, RecipeTag, RecipeTool } from "~/lib/api/types/recipe";

const props = defineProps<{ recipe: NoUndefinedField<Recipe> }>();

const i18n = useI18n();
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

// One time value on the meta line; the rest stay discoverable via the tooltip.
const timeDisplay = computed(
  () => props.recipe.totalTime || props.recipe.performTime || props.recipe.prepTime || "",
);

const timeTitle = computed(() => {
  const parts: string[] = [];
  if (props.recipe.totalTime) {
    parts.push(`${i18n.t("recipe.total-time")}: ${props.recipe.totalTime}`);
  }
  if (props.recipe.prepTime) {
    parts.push(`${i18n.t("recipe.prep-time")}: ${props.recipe.prepTime}`);
  }
  if (props.recipe.performTime) {
    parts.push(`${i18n.t("recipe.perform-time")}: ${props.recipe.performTime}`);
  }
  return parts.join(" · ");
});
</script>
