<template>
  <div v-if="items.length > 0">
    <h2
      v-if="title"
      class="mt-4"
    >
      {{ title }}
    </h2>
    <v-chip
      v-for="category in items.slice(0, limit)"
      :key="category.name"
      class="fork-tag mr-1 mt-1"
      variant="flat"
      :size="small ? 'small' : 'default'"
      :style="{ '--tc': tagHue(category.name) }"
      @click.prevent="() => $emit('item-selected', category, urlPrefix)"
    >
      <span class="fork-tag__dot" />
      {{ truncateText(category.name) }}
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import type { RecipeCategory, RecipeTag, RecipeTool } from "~/lib/api/types/recipe";
import { truncateText as truncatePlainText } from "~/lib/sanitize/text";
import { tagHue } from "~/composables/recipes/use-tag-color";

export type UrlPrefixParam = "tags" | "categories" | "tools";

interface Props {
  truncate?: boolean;
  items?: RecipeCategory[] | RecipeTag[] | RecipeTool[];
  title?: boolean;
  urlPrefix?: UrlPrefixParam;
  limit?: number;
  small?: boolean;
  maxWidth?: string | null;
}
const props = withDefaults(defineProps<Props>(), {
  truncate: false,
  items: () => [],
  title: false,
  urlPrefix: "categories",
  limit: 999,
  small: false,
  maxWidth: null,
});

defineEmits(["item-selected"]);
function truncateText(text: string, length = 20, clamp = "...") {
  if (!props.truncate) return text;
  return truncatePlainText(text, length, clamp);
}
</script>

<style scoped>
/* Fork: tinted pill + colored dot. --tc is the per-tag hue. */
.fork-tag.v-chip {
  background: color-mix(in srgb, var(--tc) 16%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--tc) 32%, transparent);
  color: rgb(var(--v-theme-on-surface));
  font-weight: 500;
  letter-spacing: 0.01em;
}
.fork-tag.v-chip:hover {
  background: color-mix(in srgb, var(--tc) 26%, transparent) !important;
}
.fork-tag__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--tc);
  margin-right: 7px;
  flex: 0 0 auto;
}
</style>
