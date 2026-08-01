<template>
  <div @click.prevent>
    <!-- User Rating. ALWAYS interactive on your own group — this used to be gated on
         `userRating || isHovering || !ratingsLoaded`, which made rating undiscoverable
         (hover-to-reveal is invisible; a daily user with 271 recipes had 0 ratings because
         nothing ever said rating existed) and effectively impossible on touch (isHovering
         comes from mouseenter, which a PWA tap fires flakily at best). An empty interactive
         row IS the affordance: five hollow stars in the accent color read as "rate this". -->
    <v-rating
      v-if="isOwnGroup"
      :model-value="userRating"
      active-color="secondary"
      color="secondary-lighten-3"
      length="5"
      :density="small ? 'compact' : 'default'"
      :size="small ? 'x-small' : undefined"
      hover
      clearable
      @update:model-value="updateRating(+$event)"
    />
    <!-- Group Rating: public/shared views only, where you cannot rate anyway. Explicitly
         readonly — it used to keep the per-star hover effect with no click handler, which
         reads as a broken button. -->
    <v-rating
      v-else
      :model-value="groupRating"
      :half-increments="true"
      active-color="grey-darken-1"
      color="secondary-lighten-3"
      length="5"
      :density="small ? 'compact' : 'default'"
      :size="small ? 'x-small' : undefined"
      readonly
    />
  </div>
</template>

<script setup lang="ts">
import { useLoggedInState } from "~/composables/use-logged-in-state";
import { useUserSelfRatings } from "~/composables/use-users";

interface Props {
  emitOnly?: boolean;
  recipeId?: string;
  slug?: string;
  small?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  emitOnly: false,
  recipeId: "",
  slug: "",
  small: false,
});

const modelValue = defineModel<number>({ default: 0 });

const { isOwnGroup } = useLoggedInState();
const { userRatings, setRating } = useUserSelfRatings();

const userRating = computed(() => {
  return userRatings.value.find(r => r.recipeId === props.recipeId)?.rating ?? undefined;
});

// if a user unsets their rating, we don't want to fall back to the group rating since it's out of sync
const hideGroupRating = ref(!!userRating.value);
watch(
  () => userRating.value,
  () => {
    if (userRating.value) {
      hideGroupRating.value = true;
    }
  },
);

const groupRating = computed(() => {
  return hideGroupRating.value ? 0 : modelValue.value;
});

function updateRating(val?: number) {
  if (!isOwnGroup.value) {
    return;
  }

  if (val === userRating.value) {
    val = 0;
  }

  if (!props.emitOnly) {
    setRating(props.slug, val || 0, null);
  }
  modelValue.value = val ?? 0;
}
</script>

<style lang="scss" scoped></style>
