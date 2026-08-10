<template>
  <div>
    <RecipeExplorerPage />
  </div>
</template>

<script setup lang="ts">
import RecipeExplorerPage from "~/components/Domain/Recipe/RecipeExplorerPage/RecipeExplorerPage.vue";

// Named so the layout's KeepAlive include-list can match it: back-navigation re-activates this
// page (DOM, loaded list, scroll) instead of remounting and refetching it.
defineOptions({ name: "HomeGridPage" });
</script>
