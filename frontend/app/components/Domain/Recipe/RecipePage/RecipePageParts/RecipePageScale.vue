<template>
  <div class="d-flex justify-space-between align-center pt-2 pb-3">
    <RecipeScaleEditButton
      v-if="!isEditMode && showServings"
      v-model.number="scale"
      :recipe-servings="recipeServings"
      :edit-scale="hasFoodOrUnit && !isEditMode"
    />
  </div>
</template>

<script setup lang="ts">
import RecipeScaleEditButton from "~/components/Domain/Recipe/RecipeScaleEditButton.vue";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe } from "~/lib/api/types/recipe";
import { usePageState } from "~/composables/recipe-page/shared-state";
import { hasMacros } from "~/composables/recipes/use-macro-summary";

const props = defineProps<{ recipe: NoUndefinedField<Recipe> }>();

const scale = defineModel<number>({ default: 1 });

const { isEditMode, isCookMode } = usePageState(props.recipe.slug);

const recipeServings = computed<number>(() => {
  return props.recipe.recipeServings || props.recipe.recipeYieldQuantity || 1;
});

const hasFoodOrUnit = computed(() => {
  if (props.recipe.recipeIngredient) {
    for (const ingredient of props.recipe.recipeIngredient) {
      if (ingredient.food || ingredient.unit) {
        return true;
      }
    }
  }
  return false;
});

// The static "Serves N" chip duplicates the macro bar's servings cell. Show it only
// when scaling is interactive, or when the macro bar isn't there to display servings
// (nutrition hidden/absent, or cook mode where the bar never renders).
const showServings = computed(() => {
  const canScale = hasFoodOrUnit.value && recipeServings.value > 0;
  const macroBarVisible
    = props.recipe.settings.showNutrition && hasMacros(props.recipe.nutrition) && !isCookMode.value;
  return canScale || !macroBarVisible;
});
</script>
