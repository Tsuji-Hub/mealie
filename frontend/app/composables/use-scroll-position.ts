const scrollPositions = new Map<string, number>();
const pagePositions = new Map<string, number>();

// One number per route visited would take years to matter, but it's the same unbounded-growth
// shape as the asyncData leak, on the hottest path — cap it on principle. Maps iterate in
// insertion order, so re-setting a key before writing makes them LRU for free.
const MAX_POSITIONS = 30;

function setBounded(map: Map<string, number>, key: string, value: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_POSITIONS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    map.delete(oldest);
  }
}

export function useScrollPosition() {
  const router = useRouter();

  let observer: MutationObserver | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let fallback: ReturnType<typeof setTimeout> | null = null;

  function savePosition(path: string, page: number) {
    setBounded(scrollPositions, path, document.documentElement.scrollTop);
    setBounded(pagePositions, path, page);
  }

  function getSavedPage(path: string): number | undefined {
    return pagePositions.get(path);
  }

  function restorePosition(path: string) {
    const savedPosition = scrollPositions.get(path);
    if (!savedPosition) return;

    observer?.disconnect();
    if (timeout) clearTimeout(timeout);
    if (fallback) clearTimeout(fallback);

    fallback = setTimeout(() => {
      if (timeout) clearTimeout(timeout);
      observer?.disconnect();
      document.documentElement.scrollTop = savedPosition;
    }, 500);

    observer = new MutationObserver(() => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (fallback) clearTimeout(fallback);
        observer?.disconnect();
        document.documentElement.scrollTop = savedPosition;
      }, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  const unregisterBefore = router.beforeEach((to, from) => {
    setBounded(scrollPositions, from.path, document.documentElement.scrollTop);
  });

  onUnmounted(() => {
    unregisterBefore();
    observer?.disconnect();
    if (timeout) clearTimeout(timeout);
    if (fallback) clearTimeout(fallback);
  });

  return {
    savePosition,
    getSavedPage,
    restorePosition,
  };
}
