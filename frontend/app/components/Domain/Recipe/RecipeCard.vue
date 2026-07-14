<template>
  <v-card
    class="fork-tile"
    flat
    border
    rounded="xl"
    :style="{ cursor }"
    :to="recipeRoute"
    @click.self="$emit('click')"
  >
    <div class="fork-tile__media">
      <RecipeCardImage
        small
        :icon-size="imageHeight"
        :height="imageHeight"
        :slug="slug"
        :recipe-id="recipeId"
        :image-version="image"
      >
        <div class="fork-tile__overlay">
          <span
            v-if="primaryTag"
            class="fork-tile__tag"
            :style="{ '--tc': tagHue(primaryTag) }"
          >
            <span class="fork-tile__dot" />
            <span class="fork-tile__ellip">{{ primaryTag }}</span>
          </span>

          <span v-if="metric" class="fork-tile__metric">
            <v-icon v-if="metricIcon" size="13" class="mr-1">{{ metricIcon }}</v-icon>
            <span class="fork-tile__ellip">{{ metric }}</span>
          </span>
        </div>
      </RecipeCardImage>
    </div>

    <div class="fork-tile__body">
      <h3 class="fork-tile__title">
        {{ name }}
      </h3>
      <div class="fork-tile__meta">
        <RecipeFavoriteBadge
          v-if="isOwnGroup"
          :recipe-id="recipeId"
          show-always
        />
        <RecipeCardRating
          v-if="rating"
          :model-value="rating"
          :recipe-id="recipeId"
        />
        <v-spacer />
        <RecipeContextMenu
          v-if="isOwnGroup && showRecipeContent"
          class="fork-tile__menu"
          :slug="slug"
          :menu-icon="$globals.icons.dotsVertical"
          :name="name"
          :recipe-id="recipeId"
          :use-items="{
            delete: false,
            edit: false,
            download: true,
            mealplanner: true,
            shoppingList: true,
            print: false,
            printPreferences: false,
            share: true,
          }"
          @deleted="$emit('delete', slug)"
        />
      </div>
    </div>

    <slot />
  </v-card>
</template>

<script setup lang="ts">
import RecipeFavoriteBadge from "./RecipeFavoriteBadge.vue";
import RecipeContextMenu from "./RecipeContextMenu/RecipeContextMenu.vue";
import RecipeCardImage from "./RecipeCardImage.vue";
import RecipeCardRating from "./RecipeCardRating.vue";
import { tagHue } from "~/composables/recipes/use-tag-color";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import type { RecipeCategory, RecipeTag } from "~/lib/api/types/recipe";

interface Props {
  name: string;
  slug: string;
  description?: string | null;
  rating?: number;
  ratingColor?: string;
  image?: string;
  tags?: RecipeTag[] | null;
  categories?: RecipeCategory[] | null;
  recipeId: string;
  imageHeight?: number;
  calories?: string | null;
  totalTime?: string | null;
  servings?: number;
  yieldText?: string | null;
}
const props = withDefaults(defineProps<Props>(), {
  description: null,
  rating: 0,
  ratingColor: "secondary",
  image: "abc123",
  tags: () => [],
  categories: () => [],
  imageHeight: 220,
  calories: null,
  totalTime: null,
  servings: 0,
  yieldText: null,
});

defineEmits<{
  click: [];
  delete: [slug: string];
}>();

const { $globals } = useNuxtApp();
const auth = useMealieAuth();
const { isOwnGroup } = useLoggedInState();

const route = useRoute();
const groupSlug = computed(() => route.params.groupSlug || auth.user.value?.groupSlug || "");
const showRecipeContent = computed(() => props.recipeId && props.slug);
const recipeRoute = computed<string>(() =>
  showRecipeContent.value ? `/g/${groupSlug.value}/r/${props.slug}` : "",
);
const cursor = computed(() => (showRecipeContent.value ? "pointer" : "auto"));

// One identity tag in the corner: prefer a category, fall back to the first tag.
const primaryTag = computed(
  () => props.categories?.[0]?.name || props.tags?.[0]?.name || "",
);

// One metric badge: calories when available (the point of a macro app), else total
// time, else servings. Auto-upgrades to kcal the moment the list payload carries it.
const yieldNoun = computed(() => (props.yieldText || "").replace(/^[\d.\s]+/, "").trim());
const metric = computed(() => {
  if (props.calories) {
    return `${props.calories} kcal`;
  }
  if (props.totalTime) {
    return props.totalTime;
  }
  if (props.servings) {
    return `${props.servings} ${yieldNoun.value || "servings"}`;
  }
  return "";
});
const metricIcon = computed(() => {
  if (props.calories) {
    return ""; // "106 kcal" reads clearly without an icon
  }
  if (props.totalTime) {
    return $globals.icons.clockOutline;
  }
  return $globals.icons.potSteam;
});
</script>

<style scoped>
.fork-tile.v-card {
  overflow: hidden;
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease,
    border-color 0.22s ease;
}
.fork-tile.v-card:hover {
  transform: translateY(-5px);
  box-shadow: var(--fork-shadow-sm) !important;
  border-color: color-mix(in srgb, rgb(var(--v-theme-primary)) 42%, transparent);
}
.fork-tile__media {
  overflow: hidden;
}
.fork-tile:hover .fork-tile__media :deep(.v-img__img) {
  transform: scale(1.05);
}
.fork-tile__media :deep(.v-img__img) {
  transition: transform 0.5s ease;
}

.fork-tile__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.fork-tile__overlay > * {
  pointer-events: auto;
}

.fork-tile__tag,
.fork-tile__metric {
  position: absolute;
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #f4efe8;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(18, 13, 9, 0.5);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  line-height: 1.2;
}
.fork-tile__tag {
  top: 10px;
  left: 10px;
  gap: 6px;
  max-width: calc(100% - 20px);
}
.fork-tile__metric {
  max-width: calc(100% - 20px);
}
.fork-tile__ellip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.fork-tile__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--tc);
}
.fork-tile__metric {
  bottom: 10px;
  left: 10px;
}

.fork-tile__body {
  padding: 13px 15px 14px;
}
.fork-tile__title {
  font-family: var(--fork-font-display);
  font-weight: 530;
  font-size: 1.12rem;
  line-height: 1.16;
  letter-spacing: -0.01em;
  font-variation-settings: "opsz" 40;
  color: rgb(var(--v-theme-on-surface));
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
.fork-tile__meta {
  display: flex;
  align-items: center;
  margin-top: 8px;
  min-height: 24px;
}
</style>
