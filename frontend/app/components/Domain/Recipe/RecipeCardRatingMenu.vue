<template>
  <!-- Same pattern as RecipeCardCategoryMenu, deliberately: one tap/click on a small chip opens
       a menu with a full-size control. Identical interaction on desktop (click) and the PWA
       (tap) — no hover anywhere, which is what made rating undiscoverable the first time. -->
  <v-menu
    v-if="isOwnGroup"
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
    offset="6"
  >
    <template #activator="{ props: menuProps }">
      <slot name="activator" :props="menuProps" :label="chipLabel" :rated="!!userRating" />
    </template>

    <v-card class="fork-rate-card" min-width="252">
      <div class="fork-rate-card__title">
        {{ userRating ? "Your rating" : "Rate this recipe" }}
      </div>
      <!-- The real thing, full size with half stars — reused, not reimplemented. Closing on
           update gives tap-star-done, the one-gesture flow a rating deserves. -->
      <RecipeRating
        :key="recipeId"
        :model-value="groupRating"
        :recipe-id="recipeId"
        :slug="slug"
        @update:model-value="open = false"
      />
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import RecipeRating from "./RecipeRating.vue";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import { useUserSelfRatings } from "~/composables/use-users";

const props = withDefaults(
  defineProps<{
    recipeId: string;
    slug: string;
    /** The group-average rating, used as display fallback when the user hasn't rated. */
    groupRating?: number;
  }>(),
  { groupRating: 0 },
);

const open = ref(false);

const { isOwnGroup } = useLoggedInState();
const { userRatings } = useUserSelfRatings();

const userRating = computed(
  () => userRatings.value.find(r => r.recipeId === props.recipeId)?.rating ?? undefined,
);

/** "4.5" for the chip — the user's own rating first, else the group average, else empty
 * (a bare hollow star then reads as "rate me"). */
const chipLabel = computed(() => {
  const value = userRating.value || props.groupRating || 0;
  return value ? String(Math.round(value * 2) / 2) : "";
});
</script>

<style lang="scss" scoped>
.fork-rate-card {
  border-radius: 16px;
  padding: 12px 16px 14px;
}

.fork-rate-card__title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fork-text-3);
  margin-bottom: 4px;
}
</style>
