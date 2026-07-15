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
          <!-- Top row: category pill (shrinks) on the left, calories on the right.
               Flex keeps them from overlapping on narrow cards. -->
          <div class="fork-tile__top">
            <!-- Logged in: pill opens a quick-categorize menu (files into cookbooks). -->
            <RecipeCardCategoryMenu
              v-if="isOwnGroup"
              v-model="localCategories"
              :recipe-id="recipeId"
              @category-removed="cat => $emit('categoryRemoved', slug, cat)"
            >
              <template #activator="{ props: menuProps }">
                <button
                  type="button"
                  class="fork-tile__tag fork-tile__tag--btn"
                  :style="primaryCategory ? { '--tc': tagHue(primaryCategory.name) } : undefined"
                  v-bind="menuProps"
                  @click.stop.prevent
                >
                  <span v-if="primaryCategory" class="fork-tile__dot" />
                  <v-icon v-else size="13" class="fork-tile__plus">
                    {{ $globals.icons.createAlt }}
                  </v-icon>
                  <span class="fork-tile__ellip">
                    {{ primaryCategory ? primaryCategory.name : "Category" }}
                  </span>
                  <v-icon size="12" class="fork-tile__caret">
                    {{ $globals.icons.chevronDown }}
                  </v-icon>
                </button>
              </template>
            </RecipeCardCategoryMenu>

            <!-- Logged out / public: plain read-only pill. -->
            <span
              v-else-if="staticTag"
              class="fork-tile__tag"
              :style="{ '--tc': tagHue(staticTag) }"
            >
              <span class="fork-tile__dot" />
              <span class="fork-tile__ellip">{{ staticTag }}</span>
            </span>

            <span v-if="calories" class="fork-tile__kcal">
              <b>{{ calories }}</b> kcal
            </span>
          </div>

          <span v-if="timeLabel" class="fork-tile__time">
            <v-icon size="12" class="mr-1">{{ $globals.icons.clockOutline }}</v-icon>{{ timeLabel }}
          </span>
        </div>
      </RecipeCardImage>
    </div>

    <div class="fork-tile__body">
      <h3 class="fork-tile__title">
        {{ name }}
      </h3>
      <div class="fork-tile__meta">
        <span v-if="servingsLabel" class="fork-tile__stats">
          <span class="fork-tile__stat">
            <v-icon size="13">{{ $globals.icons.potSteam }}</v-icon>{{ servingsLabel }}
          </span>
        </span>
        <v-spacer />
        <RecipeFavoriteBadge
          v-if="isOwnGroup"
          :recipe-id="recipeId"
          show-always
        />
        <RecipeContextMenu
          v-if="isOwnGroup && showRecipeContent"
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
import RecipeCardCategoryMenu from "./RecipeCardCategoryMenu.vue";
import { tagHue } from "~/composables/recipes/use-tag-color";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import type { RecipeCategory, RecipeTag } from "~/lib/api/types/recipe";

interface Props {
  name: string;
  slug: string;
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
  /** Unfiled from a category — NOT a deletion. The list owner decides if it still belongs. */
  categoryRemoved: [slug: string, category: RecipeCategory];
}>();

const auth = useMealieAuth();
const { isOwnGroup } = useLoggedInState();

const route = useRoute();
const groupSlug = computed(() => route.params.groupSlug || auth.user.value?.groupSlug || "");
const showRecipeContent = computed(() => props.recipeId && props.slug);
const recipeRoute = computed<string>(() =>
  showRecipeContent.value ? `/g/${groupSlug.value}/r/${props.slug}` : "",
);
const cursor = computed(() => (showRecipeContent.value ? "pointer" : "auto"));

// Local copy of the recipe's categories so the quick-categorize menu can update the pill
// optimistically without refetching the whole list; re-syncs if the list refreshes.
const localCategories = ref<RecipeCategory[]>([...(props.categories || [])]);
watch(
  () => props.categories,
  value => (localCategories.value = [...(value || [])]),
);

// Interactive pill (logged in) shows the first category, or "+ Category" when none.
const primaryCategory = computed<RecipeCategory | null>(() => localCategories.value[0] || null);
// Read-only pill (logged out) keeps the old category-or-tag display.
const staticTag = computed(
  () => props.categories?.[0]?.name || props.tags?.[0]?.name || "",
);

const timeLabel = computed(() => props.totalTime || "");
const yieldNoun = computed(() => (props.yieldText || "").replace(/^[\d.\s]+/, "").trim());
const servingsLabel = computed(() =>
  props.servings ? `${props.servings} ${yieldNoun.value || "servings"}` : "",
);
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
.fork-tile__media :deep(.v-img__img) {
  transition: transform 0.5s ease;
}
.fork-tile:hover .fork-tile__media :deep(.v-img__img) {
  transform: scale(1.05);
}

.fork-tile__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.fork-tile__overlay > * {
  pointer-events: auto;
}

.fork-tile__top {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.fork-tile__tag,
.fork-tile__kcal,
.fork-tile__time {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: #f4efe8;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(18, 13, 9, 0.5);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  line-height: 1.2;
}
.fork-tile__tag {
  gap: 6px;
  font-weight: 600;
  flex: 0 1 auto;
  min-width: 0;
}
.fork-tile__tag--btn {
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.fork-tile__plus {
  margin-right: 3px;
}
.fork-tile__caret {
  margin-left: 3px;
  opacity: 0.75;
}
/* Calories: always pinned to the right of the top row, never shrinks. */
.fork-tile__kcal {
  margin-left: auto;
  flex: 0 0 auto;
  font-weight: 500;
  white-space: nowrap;
}
.fork-tile__kcal b {
  font-weight: 700;
  margin-right: 3px;
}
/* Time: its own badge, bottom-right of the photo. */
.fork-tile__time {
  position: absolute;
  bottom: 10px;
  right: 10px;
  font-weight: 500;
  white-space: nowrap;
}

/* Narrow (2-up phone) cards: shrink the badges so the category name + calories
   both fit, and drop the caret to save room. */
@media (max-width: 599px) {
  .fork-tile__tag,
  .fork-tile__kcal,
  .fork-tile__time {
    font-size: 10.5px;
    padding: 3px 8px;
  }
  .fork-tile__caret {
    display: none;
  }
}
.fork-tile__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--tc);
  flex: 0 0 auto;
}
.fork-tile__ellip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.fork-tile__body {
  padding: 13px 15px 12px;
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
  margin-top: 9px;
  min-height: 26px;
}
/* Footer action buttons: transparent, not the theme's filled-secondary default
   (which rendered as a low-contrast tan square over the card surface). */
.fork-tile__meta :deep(.v-btn) {
  background-color: transparent !important;
}
.fork-tile__stats {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
  color: var(--fork-text-3);
  font-size: 12.5px;
}
.fork-tile__stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (prefers-reduced-motion: reduce) {
  .fork-tile.v-card,
  .fork-tile__media :deep(.v-img__img) {
    transition: none !important;
  }
  .fork-tile.v-card:hover,
  .fork-tile:hover .fork-tile__media :deep(.v-img__img) {
    transform: none !important;
  }
}
</style>
