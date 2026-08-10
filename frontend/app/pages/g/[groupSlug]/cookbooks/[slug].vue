<template>
  <CookbookPage />
</template>

<script setup lang="ts">
import CookbookPage from "@/components/Domain/Cookbook/CookbookPage.vue";

// Named so the layout's KeepAlive include-list can match it: cookbook -> recipe -> back is a
// re-activation, not a remount + refetch. The KeepAlive max caps how many stay warm.
defineOptions({ name: "CookbookGridPage" });
</script>
