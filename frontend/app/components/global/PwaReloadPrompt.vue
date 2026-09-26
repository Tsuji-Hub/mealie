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
import { watchForNewBuild } from "~/composables/use-app-update";

const nuxtApp = useNuxtApp();
const { $pwa } = nuxtApp;

const dismissed = ref(false);
const newBuild = ref(false);

// The service worker now skips waiting (nuxt.config.ts), so vite-pwa's needRefresh stays
// false; the prompt is driven by watchForNewBuild instead. needRefresh is kept for safety.
const needRefresh = computed(() => (!!$pwa?.needRefresh || newBuild.value) && !dismissed.value);

let stopWatching: (() => void) | undefined;
onMounted(() => {
  stopWatching = watchForNewBuild({
    container: typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null,
    onBuildChanged: callback => nuxtApp.hook("app:manifest:update", callback),
    onNewBuild: () => {
      newBuild.value = true;
      dismissed.value = false;
    },
  });
});
onUnmounted(() => stopWatching?.());

async function reload() {
  if ($pwa?.needRefresh) {
    // A waiting worker (only possible from an older SW build): activate it, then reload.
    await $pwa.updateServiceWorker(true);
    return;
  }
  // The new worker is already active and controlling this page; a plain reload loads the
  // new shell and chunks.
  window.location.reload();
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
