<template>
  <div>
    <!-- Recipe Categories (view-mode chips live in the page hero; these are edit selectors) -->
    <v-card
      v-if="isEditForm"
      :class="{ 'mt-10': !isEditForm }"
    >
      <v-card-title class="py-2">
        {{ $t("recipe.categories") }}
      </v-card-title>
      <v-divider class="mx-2" />
      <v-card-text>
        <RecipeOrganizerSelector
          v-if="isEditForm"
          v-model="recipe.recipeCategory"
          :return-object="true"
          :show-add="true"
          selector-type="categories"
        />
        <RecipeChips
          v-else
          :items="recipe.recipeCategory"
          v-bind="$attrs"
        />
      </v-card-text>
    </v-card>

    <!-- Recipe Tags (view-mode chips live in the page hero; these are edit selectors) -->
    <v-card
      v-if="isEditForm"
      class="mt-4"
    >
      <v-card-title class="py-2">
        {{ $t("tag.tags") }}
      </v-card-title>
      <v-divider class="mx-2" />
      <v-card-text>
        <RecipeOrganizerSelector
          v-if="isEditForm"
          v-model="recipe.tags"
          :return-object="true"
          :show-add="true"
          selector-type="tags"
        />
        <RecipeChips
          v-else
          :items="recipe.tags"
          url-prefix="tags"
          v-bind="$attrs"
        />
      </v-card-text>
    </v-card>

    <!-- Recipe Tools Edit -->
    <v-card
      v-if="isEditForm"
      class="mt-2"
    >
      <v-card-title class="py-2">
        {{ $t('tool.required-tools') }}
      </v-card-title>
      <v-divider class="mx-2" />
      <v-card-text>
        <RecipeOrganizerSelector
          v-model="recipe.tools"
          selector-type="tools"
          v-bind="$attrs"
        />
      </v-card-text>
    </v-card>

    <RecipeNutrition
      v-if="recipe.settings.showNutrition"
      :model-value="recipe.nutrition"
      class="mt-4"
      :edit="isEditForm"
      @update:model-value="onNutritionUpdated"
    />
    <RecipeAssets
      v-if="recipe.settings.showAssets"
      v-model="recipe.assets"
      :edit="isEditForm"
      :slug="recipe.slug"
      :recipe-id="recipe.id"
    />
  </div>
</template>

<script setup lang="ts">
import { usePageState } from "~/composables/recipe-page/shared-state";
import { nutritionChanged, withoutEstimateFlag } from "~/composables/recipes/use-nutrition-estimate";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Nutrition, Recipe } from "~/lib/api/types/recipe";
import RecipeOrganizerSelector from "@/components/Domain/Recipe/RecipeOrganizerSelector.vue";
import RecipeNutrition from "~/components/Domain/Recipe/RecipeNutrition.vue";
import RecipeChips from "@/components/Domain/Recipe/RecipeChips.vue";
import RecipeAssets from "@/components/Domain/Recipe/RecipeAssets.vue";

const recipe = defineModel<NoUndefinedField<Recipe>>({ required: true });
const { isEditForm } = usePageState(recipe.value.slug);

/**
 * A hand-edited macro stops being an estimate — it's his number now, so the ~ has to go.
 *
 * Gated on an actual value change rather than on the event firing: the number inputs
 * round-trip a stored "450" back as 450, so treating every emit as an edit would drop the
 * flag just for opening the edit form, and the ~ would vanish off a number nobody checked.
 */
function onNutritionUpdated(value: Nutrition) {
  const edited = nutritionChanged(recipe.value.nutrition, value);
  recipe.value.nutrition = value as NoUndefinedField<Nutrition>;

  if (edited) {
    recipe.value.extras = withoutEstimateFlag(recipe.value.extras) as NoUndefinedField<Recipe>["extras"];
  }
}
</script>
