<template>
  <div class="fork-hero">
    <!-- Photo hero: full-bleed image with the title + tags over a scrim -->
    <div v-if="hasPhoto" class="fork-hero__media">
      <v-img
        :key="imageKey"
        :src="recipeImageUrl"
        :height="heroHeight"
        cover
        class="fork-hero__img d-print-none"
        @error="hideImage = true"
      />
      <div class="fork-hero__scrim" />
      <div class="fork-hero__overlay">
        <RecipePageHeroText :recipe="recipe" />
      </div>
    </div>

    <!-- Flat hero: no photo (or edit mode) — title + tags on the page -->
    <div v-else class="fork-hero__flat">
      <RecipePageHeroText :recipe="recipe" />
    </div>

    <!-- Signature macro stat block; floats over the photo's lower edge when present -->
    <RecipePageMacroBar
      :recipe="recipe"
      :class="{ 'fork-hero__stats--float': hasPhoto }"
    />

    <div v-if="recipe.description || timeDisplay || recipe.rating" class="fork-hero__foot">
      <SafeMarkdown
        v-if="recipe.description"
        :source="recipe.description"
        class="fork-hero__desc"
      />
      <div v-if="timeDisplay || recipe.rating" class="fork-hero__meta">
        <span v-if="timeDisplay" class="d-inline-flex align-center" :title="timeTitle">
          <v-icon size="small" color="primary" class="mr-1">
            {{ $globals.icons.clockOutline }}
          </v-icon>
          {{ timeDisplay }}
        </span>
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
  </div>
</template>

<script setup lang="ts">
import RecipePageHeroText from "./RecipePageHeroText.vue";
import RecipePageMacroBar from "./RecipePageMacroBar.vue";
import RecipeRating from "~/components/Domain/Recipe/RecipeRating.vue";
import { useStaticRoutes } from "~/composables/api";
import { usePageState } from "~/composables/recipe-page/shared-state";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe } from "~/lib/api/types/recipe";

interface Props {
  recipe: NoUndefinedField<Recipe>;
  landscape: boolean;
}
const props = defineProps<Props>();

const i18n = useI18n();
const display = useDisplay();
const { recipeImage, recipeSmallImage } = useStaticRoutes();
const { imageKey, isEditMode } = usePageState(props.recipe.slug);

const hideImage = ref(false);

const hasPhoto = computed(() => !!props.recipe.image && !hideImage.value && !isEditMode.value);

const heroHeight = computed(() => (display.mdAndUp.value ? 420 : display.smAndUp.value ? 340 : 270));

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
