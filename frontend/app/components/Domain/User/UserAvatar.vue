<template>
  <v-tooltip
    v-if="userId"
    :disabled="!user || !tooltip"
    location="end"
  >
    <template #activator="{ props: tooltipProps }">
      <v-avatar
        v-if="list"
        v-bind="tooltipProps"
        @mouseenter="hydrateForTooltip"
      >
        <v-img
          :src="imageURL"
          :alt="userId"
          @load="error = false"
          @error="error = true"
        />
      </v-avatar>
      <v-avatar
        v-else
        :size="size"
        v-bind="tooltipProps"
        @mouseenter="hydrateForTooltip"
      >
        <v-img
          :src="imageURL"
          :alt="userId"
          @load="error = false"
          @error="error = true"
        />
      </v-avatar>
    </template>
    <span v-if="user">
      {{ user.fullName }}
    </span>
  </v-tooltip>
</template>

<script setup lang="ts">
import { useUserStore } from "~/composables/store/use-user-store";

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
  list: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String,
    default: "42",
  },
  tooltip: {
    type: Boolean,
    default: true,
  },
});

const error = ref(false);

const auth = useMealieAuth();
// Lazy: the image renders from a direct URL; the store exists ONLY to put a full name in the
// tooltip. Constructed eagerly, every avatar (including the sidebar's, which disables the
// tooltip entirely) fetched the whole member list on every installed-app cold launch. First
// hover hydrates it, exactly when a tooltip could be shown.
const { store: users, actions: userActions } = useUserStore(undefined, { lazy: true });
const user = computed(() => {
  return users.value.find(user => user.id === props.userId);
});

function hydrateForTooltip() {
  if (props.tooltip) {
    userActions.hydrate();
  }
}

const imageURL = computed(() => {
  // Note: auth.user is a ref now
  const authUser = auth.user.value;
  const key = authUser?.cacheKey ?? "";
  return `/api/media/users/${props.userId}/profile.webp?cacheKey=${key}`;
});
</script>
