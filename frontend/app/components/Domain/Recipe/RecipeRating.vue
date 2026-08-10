<template>
  <div @click.prevent>
    <!-- User Rating. ALWAYS interactive on your own group — this used to be gated on
         `userRating || isHovering || !ratingsLoaded`, which made rating undiscoverable
         (hover-to-reveal is invisible; a daily user with 271 recipes had 0 ratings because
         nothing ever said rating existed) and effectively impossible on touch (isHovering
         comes from mouseenter, which a PWA tap fires flakily at best). An empty interactive
         row IS the affordance: five hollow stars in the accent color read as "rate this". -->
    <!-- `?? 0`, never undefined: VRating's modelValue prop defaults to 0, so binding undefined
         (ratings not loaded yet / no rating) silently swaps in the default while the widget is
         in "controlled" mode — the live model then disagrees with what the user believes is
         set, and a tap on the current star re-sets instead of clearing (0 === 4 is false).
         Gold stars, not theme secondary: maroon filled stars read as decoration, not a rating. -->
    <v-rating
      v-if="isOwnGroup"
      :model-value="userRating ?? 0"
      active-color="amber-darken-1"
      color="grey-lighten-1"
      length="5"
      half-increments
      :density="small ? 'compact' : 'default'"
      :size="small ? 'x-small' : undefined"
      :hover="hoverCapable"
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
      active-color="amber-darken-1"
      color="grey-lighten-1"
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

// Hover preview only where hover actually exists. On touch, a tap fires mouseenter but
// mouseleave never comes, so VRating's hoverIndex sticks on the tapped star and the DISPLAY
// follows the hover ghost instead of the model (`isHovering ? isHovered : isFilled`). A
// successful clear then still LOOKS filled — the user re-taps and re-sets the rating they
// just cleared. Confirmed live on the Fold: model-value 0 while four stars rendered filled.
const hoverCapable = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches;

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
