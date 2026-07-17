<template>
  <!-- Placeholder grid shown while recipes are in flight. Exists because the alternative,
       measured live, was a content area that stayed literally black for 1.5-2.5s and then popped
       in all at once — the data was in hand at ~250ms; the page just refused to paint anything
       until everything was ready. Same column layout as the real grid so cards replace skeletons
       in place with no reflow. -->
  <v-row class="mt-2">
    <v-col
      v-for="n in count"
      :key="n"
      cols="6"
      :sm="6"
      :md="4"
      :lg="3"
      :xl="3"
    >
      <div class="fork-skel" aria-hidden="true">
        <div class="fork-skel__img" />
        <div class="fork-skel__line" />
        <div class="fork-skel__line fork-skel__line--short" />
      </div>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ count?: number }>(), { count: 8 });
</script>

<style lang="scss" scoped>
.fork-skel__img {
  aspect-ratio: 4 / 3;
  max-height: 220px;
  border-radius: 18px;
}

.fork-skel__line {
  height: 14px;
  border-radius: 7px;
  margin: 12px 6px 0;
}

.fork-skel__line--short {
  width: 55%;
}

.fork-skel__img,
.fork-skel__line {
  background: linear-gradient(
    100deg,
    var(--fork-hair) 40%,
    color-mix(in srgb, var(--fork-hair) 45%, transparent) 50%,
    var(--fork-hair) 60%
  );
  background-size: 200% 100%;
  animation: fork-skel-shimmer 1.4s ease-in-out infinite;
}

@keyframes fork-skel-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -80% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fork-skel__img,
  .fork-skel__line {
    animation: none;
  }
}
</style>
