<template>
  <!-- "New version available — reload." Exists because silent SW auto-update left open tabs
       (especially the installed PWA) running old bundles for days: three separate rounds of
       shipped work were reported broken while the phone was simply executing last week's code.
       An update the user can SEE is an update the user actually has. -->
  <v-snackbar
    :model-value="needRefresh"
    location="bottom"
    :timeout="-1"
    color="surface"
    class="pwa-reload-prompt"
  >
    <span class="mr-2">A new version of Mealie is ready.</span>
    <template #actions>
      <v-btn
        color="primary"
        variant="tonal"
        size="small"
        @click="reload"
      >
        Reload
      </v-btn>
      <v-btn
        variant="text"
        size="small"
        @click="dismiss"
      >
        Later
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
const { $pwa } = useNuxtApp();

const dismissed = ref(false);

const needRefresh = computed(() => !!$pwa?.needRefresh && !dismissed.value);

async function reload() {
  // Tells the waiting service worker to skipWaiting, then reloads onto the new bundle.
  await $pwa?.updateServiceWorker(true);
}

function dismiss() {
  // Session-local dismissal only: the prompt returns on the next update check or reload,
  // because staying stale silently is the failure mode this component exists to end.
  dismissed.value = true;
}
</script>

<style lang="scss" scoped>
.pwa-reload-prompt {
  // Sit above bottom navigation on phones.
  padding-bottom: max(8px, env(safe-area-inset-bottom));
}
</style>
