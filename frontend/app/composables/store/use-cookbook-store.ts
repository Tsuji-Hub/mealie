import type { Composer } from "vue-i18n";
import { useReadOnlyStore, useStore } from "../partials/use-store-factory";
import type { ReadCookBook, UpdateCookBook } from "~/lib/api/types/cookbook";
import { usePublicExploreApi, useUserApi } from "~/composables/api";

const cookbooks: Ref<ReadCookBook[]> = ref([]);
const loading = ref(false);
const initialized = ref(false);
const publicLoading = ref(false);
const publicInitialized = ref(false);

/** =============================================================
 * Cold-start persistence — the standalone-PWA fix (measured 2026-08-10).
 *
 * The sidebar's cookbook links render from this store, and the installed PWA cold-starts a
 * fresh renderer every launch — so the "Cookbooks" section of the menu did not EXIST until the
 * store fetch landed (~1.07s after launch on the Fold). The last-known list persists to
 * localStorage and re-seeds the store once the session confirms the same user, so the links
 * paint with the first frame; the normal store fetch still runs and replaces them.
 *
 * The public explorer writes to this same ref for OTHER groups' cookbooks — those must never
 * persist (they would seed the wrong sidebar next launch), so persistence pauses for the rest
 * of the session once the public store has ever loaded (publicInitialized).
 */
const PERSIST_VERSION = 1;
const PERSIST_KEY = "fork.cookbooks.v1";
const PERSIST_DEBOUNCE_MS = 800;

let boundUserId: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistCookbooksSoon() {
  if (!boundUserId || typeof window === "undefined" || publicInitialized.value || !cookbooks.value.length) {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify({ v: PERSIST_VERSION, who: boundUserId, items: cookbooks.value }));
    }
    catch {
      try {
        window.localStorage.removeItem(PERSIST_KEY);
      }
      catch { /* nothing left to do */ }
    }
  }, PERSIST_DEBOUNCE_MS);
}

watch(cookbooks, persistCookbooksSoon);

/** Seed the store from disk once the session says who is logged in. Safe to call often. */
export function bindPersistedCookbooks(userId: string) {
  if (typeof window === "undefined" || !userId || boundUserId === userId) {
    return;
  }
  boundUserId = userId;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) {
      return;
    }
    const blob = JSON.parse(raw) as { v: number; who: string; items?: ReadCookBook[] };
    if (blob?.v !== PERSIST_VERSION || blob.who !== userId) {
      window.localStorage.removeItem(PERSIST_KEY);
      return;
    }
    // Live data always beats the disk copy; only an empty store seeds.
    if (!cookbooks.value.length && blob.items?.length) {
      cookbooks.value = blob.items;
    }
  }
  catch {
    try {
      window.localStorage.removeItem(PERSIST_KEY);
    }
    catch { /* nothing left to do */ }
  }
}

export function resetCookbookStore() {
  cookbooks.value = [];
  loading.value = false;
  initialized.value = false;
  publicLoading.value = false;
  publicInitialized.value = false;
  boundUserId = null;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(PERSIST_KEY);
    }
    catch { /* nothing left to do */ }
  }
}

export const useCookbookStore = function (i18n?: Composer) {
  const api = useUserApi(i18n);
  const store = useStore<ReadCookBook>("cookbook", cookbooks, loading, initialized, api.cookbooks);

  const updateAll = async function (updateData: UpdateCookBook[]) {
    loading.value = true;
    updateData.forEach((cookbook, index) => {
      cookbook.position = index;
    });
    const { data } = await api.cookbooks.updateAll(updateData);
    loading.value = false;
    return data;
  };
  return { ...store, updateAll };
};

export const usePublicCookbookStore = function (groupSlug: string, i18n?: Composer) {
  const api = usePublicExploreApi(groupSlug, i18n).explore;
  return useReadOnlyStore<ReadCookBook>("cookbook", cookbooks, publicLoading, publicInitialized, api.cookbooks);
};
