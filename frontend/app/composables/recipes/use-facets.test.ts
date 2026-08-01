import { describe, expect, test } from "vitest";
import { facetOptions, facetQueryOf } from "./use-facets";
import type { FacetItem } from "~/lib/api/types/non-generated";

const beef: FacetItem = { id: "t-beef", name: "beef", slug: "beef", count: 23 };
const chicken: FacetItem = { id: "t-chicken", name: "chicken", slug: "chicken", count: 17 };
const biscoff = { id: "t-biscoff", name: "biscoff", slug: "biscoff" };

const globalStore = [beef, chicken, biscoff];

describe("facetOptions", () => {
  test("offers only what the facets contain — biscoff is absent in Dinner", () => {
    // The whole feature: an option is offered only if choosing it returns something.
    const options = facetOptions([beef, chicken], true, [], globalStore);
    expect(options.map(o => o.name)).toEqual(["beef", "chicken"]);
    expect(options.find(o => o.name === "biscoff")).toBeUndefined();
  });

  test("carries counts through for the label", () => {
    expect(facetOptions([beef], true, [], globalStore)[0]).toMatchObject({ name: "beef", count: 23 });
  });

  test("THE TRAP: a selected option stays visible at count 0 so it can be deselected", () => {
    // Selecting a tag that narrows results to zero removes it from the facets. If its option
    // vanishes with it, the chip cannot be unchecked and the user is stuck at zero results.
    const options = facetOptions([beef], true, [biscoff], globalStore);
    expect(options.find(o => o.id === "t-biscoff")).toMatchObject({ name: "biscoff", count: 0 });
  });

  test("a selected option that IS in the facets is not duplicated", () => {
    const options = facetOptions([beef, chicken], true, [beef], globalStore);
    expect(options.filter(o => o.id === "t-beef")).toHaveLength(1);
    expect(options.find(o => o.id === "t-beef")?.count).toBe(23);
  });

  test("facets failed (ok=false) falls back to the full list — the old behaviour, uncounted", () => {
    const options = facetOptions([beef], false, [], globalStore);
    expect(options.map(o => o.name)).toEqual(["beef", "chicken", "biscoff"]);
    expect(options.every(o => o.count === undefined)).toBe(true);
  });

  test("facets not yet loaded (undefined) also falls back — no empty flash on first paint", () => {
    const options = facetOptions(undefined, true, [], globalStore);
    expect(options.map(o => o.name)).toEqual(["beef", "chicken", "biscoff"]);
  });

  test("legitimately empty facets show nothing (with nothing selected) — zero organisers in scope", () => {
    expect(facetOptions([], true, [], globalStore)).toEqual([]);
  });

  test("fallback tolerates store items with missing fields", () => {
    const ragged = [{ id: null, name: "ghost" }, { id: "x", name: null }, biscoff];
    expect(facetOptions(undefined, true, [], ragged).map(o => o.name)).toEqual(["biscoff"]);
  });
});

describe("facetQueryOf", () => {
  test("keeps set-membership params, drops seed/order/pagination", () => {
    expect(
      facetQueryOf({
        search: "taco",
        categories: ["c1"],
        requireAllTags: false,
        _searchSeed: "1784",
        orderBy: "random",
        orderDirection: "desc",
        orderByNullPosition: "last",
        page: 3,
        perPage: 64,
      }),
    ).toEqual({ search: "taco", categories: ["c1"], requireAllTags: false });
  });

  test("null and undefined queries are empty", () => {
    expect(facetQueryOf(null)).toEqual({});
    expect(facetQueryOf(undefined)).toEqual({});
  });
});
