import type { FacetItem } from "~/lib/api/types/non-generated";

/**
 * Faceted-filter option lists: only offer an option if choosing it would return something.
 *
 * The selectors used to bind to the GLOBAL organiser stores — every tag in the group,
 * unconditionally — so the Dinner cookbook offered dessert-only tags like biscoff that match
 * zero recipes in scope. These helpers turn a facet response into the option list a selector
 * should actually show, and they are pure so the rules live under tests instead of inside a
 * component where nothing can contradict them.
 */

export interface FacetOption {
  id: string;
  name: string;
  slug: string;
  /** Undefined when the option comes from the fallback store (no facet data to count with). */
  count?: number;
}

interface StoreItem {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
}

/**
 * The options a selector should offer.
 *
 * - Facets healthy: facet items (zero-count options are simply absent — that's the feature),
 *   PLUS any currently-selected option the facets no longer contain, pinned in at count 0.
 *   Without the pin, selecting a tag that narrows results to nothing makes its own chip vanish
 *   and the user cannot deselect it — the one edge case that turns this feature into a trap.
 * - Facets failed or not loaded (`facets` null or `ok: false`): the full fallback list,
 *   uncounted — exactly the old behaviour. A filter list that is too long beats one that lies.
 */
export function facetOptions(
  facetItems: FacetItem[] | undefined,
  facetsOk: boolean,
  selected: StoreItem[],
  fallback: StoreItem[],
): FacetOption[] {
  if (!facetsOk || facetItems === undefined) {
    return fallback
      .filter((item): item is StoreItem & { id: string; name: string } => !!item.id && !!item.name)
      .map(item => ({ id: item.id, name: item.name, slug: item.slug || "" }));
  }

  const options: FacetOption[] = facetItems.map(item => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    count: item.count,
  }));

  const present = new Set(options.map(option => option.id));
  for (const item of selected) {
    if (item.id && !present.has(item.id)) {
      options.push({ id: item.id, name: item.name || "", slug: item.slug || "", count: 0 });
    }
  }

  return options;
}

/**
 * Strip the parts of the explorer's query that must not retrigger or shape a facet fetch:
 * the random-order seed changes on every reshuffle without changing WHICH recipes are in scope,
 * and pagination/ordering never change set membership at all.
 */
export function facetQueryOf(query: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const { _searchSeed, orderBy, orderDirection, orderByNullPosition, page, perPage, ...rest } = query || {};
  return rest;
}
