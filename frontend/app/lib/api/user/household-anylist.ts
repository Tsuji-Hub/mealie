import { BaseAPI } from "../base/base-clients";

const prefix = "/api/households/anylist";

const routes = {
  lists: `${prefix}/lists`,
  send: `${prefix}/send`,
};

export interface AnyListLists {
  lists: string[];
}

export interface AnyListItemResult {
  item: string;
  /** merged = the item was already on the list; this recipe's note was appended to it. */
  status: "added" | "merged" | "failed";
  error?: string | null;
}

export interface AnyListSendResult {
  /** The tag the backend wrote under every item (url is null when BASE_URL is unset). */
  recipe: { name: string; url?: string | null };
  results: AnyListItemResult[];
  sent: number;
  merged: number;
  failed: number;
}

/** Fork: Send-to-AnyList. The backend proxies a LAN-internal bridge; a 404 from these
 * routes means the install has no bridge configured and the UI hides entirely. */
export class AnyListAPI extends BaseAPI {
  async getLists() {
    return await this.requests.get<AnyListLists>(routes.lists);
  }

  /** Only the slug is sent: the backend resolves the recipe and builds the note itself. */
  async send(items: string[], list: string, recipeSlug: string) {
    return await this.requests.post<AnyListSendResult>(routes.send, { items, list, recipe: { slug: recipeSlug } });
  }
}
