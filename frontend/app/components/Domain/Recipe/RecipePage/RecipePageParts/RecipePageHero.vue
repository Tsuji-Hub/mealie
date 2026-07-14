<template>
  <div class="pa-4 pb-0">
    <!-- Landscape (mobile / user preference): image on top, text below -->
    <template v-if="landscape">
      <v-img
        v-if="!hideImage"
        :key="imageKey"
        :src="recipeImageUrl"
        :height="$vuetify.display.xs ? 200 : 280"
        cover
        rounded="lg"
        class="mb-3 d-print-none"
        @error="hideImage = true"
      />
      <div>
        <RecipePageHeroText :recipe="recipe" />
      </div>
    </template>

    <!-- Desktop: text left, image right -->
    <div v-else class="d-flex ga-6">
      <div class="flex-grow-1 align-self-center">
        <RecipePageHeroText :recipe="recipe" />
      </div>
      <v-img
        v-if="!hideImage"
        :key="imageKey"
        :src="recipeImageUrl"
        width="100%"
        max-width="40%"
        height="280"
        cover
        rounded="lg"
        class="flex-shrink-0 d-print-none"
        @error="hideImage = true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import RecipePageHeroText from "./RecipePageHeroText.vue";
import { useStaticRoutes } from "~/composables/api";
import { usePageState } from "~/composables/recipe-page/shared-state";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe } from "~/lib/api/types/recipe";

interface Props {
  recipe: NoUndefinedField<Recipe>;
  landscape: boolean;
}
const props = defineProps<Props>();

const display = useDisplay();
const { recipeImage, recipeSmallImage } = useStaticRoutes();
const { imageKey } = usePageState(props.recipe.slug);

const hideImage = ref(false);

const recipeImageUrl = computed(() => {
  return display.smAndDown.value
    ? recipeSmallImage(props.recipe.id, props.recipe.image, imageKey.value)
    : recipeImage(props.recipe.id, props.recipe.image, imageKey.value);
});

watch(
  () => recipeImageUrl.value,
  () => {
    hideImage.value = false;
  },
);
</script>
