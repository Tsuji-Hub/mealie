import { useReadOnlyActions, useStoreActions } from "./use-actions-factory";
import type { BoundT } from "./types";
import type { BaseCRUDAPI, BaseCRUDAPIReadOnly } from "~/lib/api/base/base-clients";
import type { QueryValue } from "~/lib/api/base/route";

export interface StoreOptions {
  /**
   * Skip the fetch on construction; the caller triggers it with `actions.hydrate()` when the
   * data is actually needed.
   *
   * Opt-in, because merely *constructing* a store hydrates it — which is fine for the small
   * ones but meant `/g/home` pulled all 2687 foods (1.2 MB, 1.3 s, 15x every other request on
   * the page combined) to populate a filter that, with no parsed ingredients, can match
   * nothing. Only the caller knows whether it needs rows or just a reference.
   */
  lazy?: boolean;
}

export const useData = function <T extends BoundT>(defaultObject: T) {
  const data = reactive({ ...defaultObject });
  function reset() {
    Object.assign(data, defaultObject);
  };

  return { data, reset };
};

export const useReadOnlyStore = function <T extends BoundT>(
  storeKey: string,
  store: Ref<T[]>,
  loading: Ref<boolean>,
  initialized: Ref<boolean>,
  api: BaseCRUDAPIReadOnly<T>,
  params = {} as Record<string, QueryValue>,
  options: StoreOptions = {},
) {
  const storeActions = useReadOnlyActions(`${storeKey}-store-readonly`, api, store, loading, initialized);

  async function refresh() {
    return await storeActions.refresh(1, -1, params);
  }

  async function hydrate() {
    if (loading.value || initialized.value) {
      return;
    }
    return await refresh();
  }

  const actions = {
    ...storeActions,
    refresh,
    hydrate,
    flushStore() {
      store.value = [];
      initialized.value = false;
    },
  };

  // initial hydration — the same guarded call `hydrate` makes, so eager stores are unchanged
  if (!options.lazy) {
    hydrate();
  }

  return { store, actions };
};

export const useStore = function <T extends BoundT>(
  storeKey: string,
  store: Ref<T[]>,
  loading: Ref<boolean>,
  initialized: Ref<boolean>,
  api: BaseCRUDAPI<unknown, T, unknown>,
  params = {} as Record<string, QueryValue>,
  options: StoreOptions = {},
) {
  const storeActions = useStoreActions(`${storeKey}-store`, api, store, loading, initialized);

  async function refresh() {
    return await storeActions.refresh(1, -1, params);
  }

  /**
   * Fetch once, if nobody has yet. Idempotent and safe to call on every menu open: the store
   * state is module-scoped, so `initialized` makes the second call free.
   */
  async function hydrate() {
    if (loading.value || initialized.value) {
      return;
    }
    return await refresh();
  }

  const actions = {
    ...storeActions,
    refresh,
    hydrate,
    flushStore() {
      store.value = [];
      initialized.value = false;
    },
  };

  // initial hydration — the same guarded call `hydrate` makes, so eager stores are unchanged
  if (!options.lazy) {
    hydrate();
  }

  return { store, actions };
};
