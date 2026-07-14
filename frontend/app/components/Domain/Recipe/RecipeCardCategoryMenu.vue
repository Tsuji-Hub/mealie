<template>
  <v-menu
    :close-on-content-click="false"
    location="bottom start"
    offset="6"
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
      <v-list-subheader>Add to category</v-list-subheader>

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
import { useUserApi } from "~/composables/api";
import { alert } from "~/composables/use-toast";
import type { Recipe, RecipeCategory } from "~/lib/api/types/recipe";

const props = defineProps<{ recipeId: string }>();

// The recipe's current categories; two-way bound so the card's pill updates optimistically.
const model = defineModel<RecipeCategory[]>({ required: true });

const api = useUserApi();
const { store: allCategories } = useCategoryStore();

function isChecked(cat: RecipeCategory): boolean {
  return model.value.some(c => c.id === cat.id);
}

async function toggle(cat: RecipeCategory) {
  const prev = model.value;
  const next = isChecked(cat)
    ? prev.filter(c => c.id !== cat.id)
    : [...prev, cat];

  model.value = next; // optimistic

  const { error } = await api.recipes.patchMany([
    { id: props.recipeId, recipeCategory: next } as Recipe,
  ]);

  if (error) {
    model.value = prev; // revert
    alert.error("Couldn't update categories");
  }
}
</script>
