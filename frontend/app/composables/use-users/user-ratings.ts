import { useUserApi } from "~/composables/api";
import type { UserRatingSummary } from "~/lib/api/types/user";

const userRatings = ref<UserRatingSummary[]>([]);
const loading = ref(false);
const ready = ref(false);

export function resetUserSelfRatings() {
  userRatings.value = [];
  loading.value = false;
  ready.value = false;
}

export const useUserSelfRatings = function () {
  const auth = useMealieAuth();

  async function refreshUserRatings() {
    if (!auth.user.value || loading.value) {
      return;
    }

    loading.value = true;
    const api = useUserApi();

    const { data } = await api.users.getSelfRatings();
    userRatings.value = data?.ratings || [];

    loading.value = false;
    ready.value = true;
  }

  async function setRating(slug: string, rating: number | null, isFavorite: boolean | null) {
    loading.value = true;
    const api = useUserApi();

    const userId = auth.user.value?.id || "";
    await api.users.setRating(userId, slug, rating, isFavorite);

    loading.value = false;
    await refreshUserRatings();
  }

  if (!ready.value) {
    refreshUserRatings();
  }

  // Fork: refreshUserRatings no-ops while the session is still resolving (auth.user is null on
  // a PWA cold start straight onto a recipe page — the share-target flow), and nothing ever
  // retried. Ratings then stayed empty for the whole visit: the rating widget read 0 against a
  // persisted rating, so a tap on the current star re-SET it instead of clearing. Watch the
  // session in and load once; the watcher disposes with the calling component, and `ready`
  // makes every later firing a no-op.
  watch(
    () => auth.user.value,
    (user) => {
      if (user && !ready.value) {
        refreshUserRatings();
      }
    },
  );

  return {
    userRatings,
    refreshUserRatings,
    setRating,
    ready,
  };
};
