<template>
  <v-menu
    :close-on-content-click="false"
    location="bottom start"
    offset="6"
    @update:model-value="(open: boolean) => open && categoryActions.hydrate()"
  >
    <template #activator="{ props: menuProps }">
      <slot name="activator" :props="menuProps" />
    </template>

    <v-list
      density="compact"
      min-width="210"
      max-height="320"
      class="fork-cat-menu"
    >
      <!-- "cookbook" not "category": every cookbook in this instance is built 1:1 on a
           category, so they name the same object, and Ethan thinks in cookbooks. UI text
           only — the component, props, API and model stay `category`. -->
      <v-list-subheader>Add to cookbook</v-list-subheader>

      <template v-if="allCategories.length">
        <v-list-item
          v-for="cat in allCategories"
          :key="cat.id"
          :active="isChecked(cat)"
          color="primary"
          @click="toggle(cat)"
        >
          <template #prepend>
            <v-checkbox-btn
              :model-value="isChecked(cat)"
              readonly
              tabindex="-1"
              density="compact"
              class="mr-1"
            />
          </template>
          <v-list-item-title>{{ cat.name }}</v-list-item-title>
        </v-list-item>
      </template>

      <v-list-item v-else>
        <v-list-item-title class="text-caption text-medium-emphasis">
          No categories yet
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import { useCategoryStore } from "~/composables/store";
import { useCookbookStore } from "~/composables/store/use-cookbook-store";
import { useUserApi } from "~/composables/api";
import { alert } from "~/composables/use-toast";
import type { Recipe, RecipeCategory } from "~/lib/api/types/recipe";

const props = defineProps<{ recipeId: string }>();

// Deliberately NOT the `delete` emit — that means "the recipe was destroyed". Unfiling
// destroys nothing (the recipe still exists, still in its other cookbooks). Reusing delete
// would work by accident today and invite a real deletion if cleanup ever hangs off it.
// Emitted only AFTER a successful PATCH, so there is nothing to undo on failure.
const emit = defineEmits<{ "category-removed": [category: RecipeCategory] }>();

// The recipe's current categories; two-way bound so the card's pill updates optimistically.
const model = defineModel<RecipeCategory[]>({ required: true });

const api = useUserApi();
// Lazy: this menu sits on EVERY card, so an eager store construction fired the unbounded
// category fetch during grid mount on every installed-app cold launch. The menu's own
// @update:model-value hydrates it on first open — the only moment the rows are shown.
const { store: allCategories, actions: categoryActions } = useCategoryStore(undefined, { lazy: true });
const { actions: cookbookActions } = useCookbookStore();

function isChecked(cat: RecipeCategory): boolean {
  return model.value.some(c => c.id === cat.id);
}

async function toggle(cat: RecipeCategory) {
  const prev = model.value;
  const removing = isChecked(cat);
  const next = removing
    ? prev.filter(c => c.id !== cat.id)
    : [...prev, cat];

  model.value = next; // optimistic

  const { error } = await api.recipes.patchMany([
    { id: props.recipeId, recipeCategory: next } as Recipe,
  ]);

  if (error) {
    model.value = prev; // revert
    alert.error("Couldn't update categories");
    return;
  }

  // Counts are computed server-side at load, so any mutation makes them stale — and a stale
  // count is worse than a stale card, because the number looks authoritative. Refetch rather
  // than doing local arithmetic: "which cookbooks does this category feed?" is the filter
  // question again, and local maths drifts. Toggles are rare; one request each is fine.
  cookbookActions.refresh();

  // Only removals can scope a card out of the view it's in. The page decides whether it does.
  if (removing) {
    emit("category-removed", cat);
  }
}
</script>
