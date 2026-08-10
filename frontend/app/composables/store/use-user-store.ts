import type { Composer } from "vue-i18n";
import { useReadOnlyStore } from "../partials/use-store-factory";
import type { StoreOptions } from "../partials/use-store-factory";
import { useRequests } from "../api/api-client";
import type { UserSummary } from "~/lib/api/types/user";
import { BaseCRUDAPIReadOnly } from "~/lib/api/base/base-clients";

const store: Ref<UserSummary[]> = ref([]);
const loading = ref(false);
const initialized = ref(false);

export function resetUserStore() {
  store.value = [];
  loading.value = false;
  initialized.value = false;
}

class GroupUserAPIReadOnly extends BaseCRUDAPIReadOnly<UserSummary> {
  baseRoute = "/api/groups/members";
  itemRoute = (idOrUsername: string | number) => `/groups/members/${idOrUsername}`;
}

// Fork: `options.lazy` supported — every UserAvatar constructed this store, so the sidebar's
// single avatar fetched the entire member list (unbounded) on every installed-app launch, to
// power a tooltip the sidebar disables. Launch-path callers pass { lazy: true }.
export const useUserStore = function (i18n?: Composer, options: StoreOptions = {}) {
  const requests = useRequests(i18n);
  const api = new GroupUserAPIReadOnly(requests);

  return useReadOnlyStore<UserSummary>("user", store, loading, initialized, api, { orderBy: "full_name" }, options);
};
