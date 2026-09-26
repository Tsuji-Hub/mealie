/**
 * Detect "a newer build is live" so the page can offer a reload.
 *
 * Why this exists: with `workbox.skipWaiting` a new service worker activates immediately, so
 * vite-pwa's prompt mode never sees a `waiting` worker and `$pwa.needRefresh` never fires.
 * Without skipWaiting the new worker waited behind any open tab forever — a phone ran a
 * pre-PROMPT-Q frontend against the newer API for days and every send 422'd. Two signals:
 *
 * - `controllerchange`: the new worker claimed this page (clientsClaim). Only meaningful when
 *   the page ALREADY had a controller; a first-ever install also fires it and is not an update.
 * - `onBuildChanged`: Nuxt's `app:manifest:update` — the server's build id moved.
 *
 * Either one means the JS running in this tab is older than what the server now serves.
 */
export function watchForNewBuild(options: {
  container?: ServiceWorkerContainer | null;
  onBuildChanged?: (callback: () => void) => void;
  onNewBuild: () => void;
}): () => void {
  const { container, onBuildChanged, onNewBuild } = options;

  let hadController = !!container?.controller;
  const onControllerChange = () => {
    if (hadController) {
      onNewBuild();
    }
    hadController = true;
  };

  container?.addEventListener("controllerchange", onControllerChange);
  onBuildChanged?.(onNewBuild);

  return () => container?.removeEventListener("controllerchange", onControllerChange);
}
