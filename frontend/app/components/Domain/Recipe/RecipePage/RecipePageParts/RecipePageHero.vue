<template>
  <div class="fork-hero">
    <!-- Photo hero: full-bleed image with the title + tags over a scrim -->
    <div v-if="hasPhoto" class="fork-hero__media">
      <v-img
        :key="imageKey"
        :src="recipeImageUrl"
        :alt="recipe.name || ''"
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

    <!-- `|| isOwnGroup` matters: without it, a recipe with no description, no time and no
         rating (108 of 272 at last count) never rendered this foot, so the correctly-gated
         rating rows inside had nowhere to mount. Fourth nested gate found on this one feature —
         when touching any layer of this chain, walk ALL of it (the full list lives in
         .claude/cowork-notes.md and each layer from here down must pass isOwnGroup through). -->
    <div v-if="recipe.description || timeDisplay || recipe.rating || isOwnGroup" class="fork-hero__foot">
      <SafeMarkdown
        v-if="recipe.description"
        :source="recipe.description"
        class="fork-hero__desc"
      />
      <div v-if="timeDisplay || recipe.rating || isOwnGroup" class="fork-hero__meta">
        <span v-if="timeDisplay" class="d-inline-flex align-center" :title="timeTitle">
          <v-icon size="small" color="primary" class="mr-1">
            {{ $globals.icons.clockOutline }}
          </v-icon>
          {{ timeDisplay }}
        </span>
        <!-- Rendered whenever YOU could rate, not only when a rating already exists. The old
             `v-if="recipe.rating"` was the second half of the discoverability bug: with zero
             ratings in the library, the rating control never mounted anywhere, so fixing the
             hover gate inside the component alone would have surfaced nothing. Public viewers
             still only see stars when a rating exists (the component renders them readonly). -->
        <!-- Full-size stars, not `small`: "they are very small" was the first thing Ethan said
             after rating became visible. These are the primary rating surface — tap targets
             matter more than compactness here. -->
        <RecipeRating
          v-if="recipe.rating || isOwnGroup"
          :key="recipe.slug"
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
import { useLoggedInState } from "~/composables/use-logged-in-state";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe } from "~/lib/api/types/recipe";

const props = defineProps<{ recipe: NoUndefinedField<Recipe> }>();

const { isOwnGroup } = useLoggedInState();

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
