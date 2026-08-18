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
  ok: boolean;
  error?: string | null;
}

export interface AnyListSendResult {
  results: AnyListItemResult[];
  sent: number;
  failed: number;
}

/** Fork: Send-to-AnyList. The backend proxies a LAN-internal bridge; a 404 from these
 * routes means the install has no bridge configured and the UI hides entirely. */
export class AnyListAPI extends BaseAPI {
  async getLists() {
    return await this.requests.get<AnyListLists>(routes.lists);
  }

  async send(items: string[], list: string) {
    return await this.requests.post<AnyListSendResult>(routes.send, { items, list });
  }
}
