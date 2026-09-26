import { useUserApi } from "~/composables/api";

/**
 * Fork: Send-to-AnyList availability + list cache.
 *
 * The backend 404s its anylist routes when no bridge is configured, and the UI must leave
 * ZERO residue on such installs — so the button renders only after this probe confirms the
 * feature. The probe fires once per session, at idle, from the recipe page (never on the
 * launch critical path — the L-round rule), and caches the list names it got back so the
 * send sheet opens with data already in hand.
 */

const available = ref<boolean | null>(null);
const lists = ref<string[]>([]);
let probeStarted = false;

export function useAnyList() {
  const api = useUserApi();

  async function probe() {
    if (probeStarted) {
      return;
    }
    probeStarted = true;
    const { data, error } = await api.anylist.getLists();
    if (error || !data) {
      // 404 = not configured (stay hidden forever); 502 = bridge down right now — also
      // hide: a button that cannot work is worse than no button, and the next session
      // re-probes.
      available.value = false;
      return;
    }
    lists.value = data.lists;
    available.value = true;
  }

  function probeAtIdle() {
    if (probeStarted || typeof window === "undefined") {
      return;
    }
    type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    const idle = (window as IdleWindow).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
    idle(() => { probe(); }, { timeout: 5000 });
  }

  /** Fresh lists for the sheet; falls back to the cached probe result on failure. */
  async function refreshLists(): Promise<string[]> {
    const { data } = await api.anylist.getLists();
    if (data?.lists?.length) {
      lists.value = data.lists;
    }
    return lists.value;
  }

  return { available, lists, probeAtIdle, refreshLists };
}

interface SendError {
  response?: { status?: number; data?: { detail?: { message?: string } | string } } | null;
}

/**
 * What to tell the user when a send fails. Before this, EVERY failure read "bridge
 * unreachable" — including a 422 from a stale cached frontend, which sent the diagnosis to
 * the bridge container when the fix was a page refresh. Each status now says what it means.
 */
export function anylistSendErrorMessage(error: unknown): string {
  const response = (error as SendError | null)?.response;
  if (!response) {
    return "Couldn't reach Mealie. Nothing was sent.";
  }
  const detail = response.data?.detail;
  const serverMessage = typeof detail === "string" ? detail : detail?.message;

  switch (response.status) {
    case 502:
      return "AnyList bridge unreachable. Nothing was sent.";
    case 422:
      // The request shape didn't match the server's: this page is older than the server.
      return "This app is out of date. Refresh the page and try again.";
    case 400:
    case 404:
      // "list not allowed", "recipe not found", "not configured": the server's words are exact.
      return serverMessage || "Refresh the page and try again.";
    default:
      return serverMessage || `Send failed (${response.status ?? "unknown error"}).`;
  }
}

export function resetAnyList() {
  available.value = null;
  lists.value = [];
  probeStarted = false;
}
