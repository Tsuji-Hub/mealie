// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { ref } from "vue";
import RecipeRating from "./RecipeRating.vue";

/**
 * The reported bug: 271 recipes, daily use, ZERO ratings — because the interactive stars were
 * hover-gated (`userRating || isHovering || !ratingsLoaded`), which is invisible on desktop and
 * near-impossible on touch. These tests pin the fixed render condition: own group -> always
 * interactive; public view -> readonly group stars.
 */

const isOwnGroup = ref(true);
const userRatings = ref<{ recipeId: string; rating: number }[]>([]);
const setRating = vi.fn();

vi.mock("~/composables/use-logged-in-state", () => ({
  useLoggedInState: () => ({ isOwnGroup }),
}));

vi.mock("~/composables/use-users", () => ({
  useUserSelfRatings: () => ({ userRatings, setRating, ready: ref(true) }),
}));

const vuetify = createVuetify({ components, directives });

function build(props: Record<string, unknown> = {}, modelValue = 0) {
  return mount(RecipeRating, {
    props: { recipeId: "r1", slug: "test-recipe", modelValue, ...props },
    global: { plugins: [vuetify] },
  });
}

/** The interactive row is the one wired to updateRating; the readonly row has --readonly. */
function interactiveRow(wrapper: ReturnType<typeof build>) {
  return wrapper.findAll(".v-rating").find(r => !r.classes().includes("v-rating--readonly"));
}

beforeEach(() => {
  isOwnGroup.value = true;
  userRatings.value = [];
  setRating.mockClear();
});

describe("RecipeRating render condition", () => {
  test("THE BUG: own group with NO rating still renders the interactive row", () => {
    // Before the fix this state showed readonly grey stars until a hover nobody knew to do.
    const wrapper = build();
    const row = interactiveRow(wrapper);
    expect(row).toBeDefined();
    expect(wrapper.findAll(".v-rating")).toHaveLength(1);
  });

  test("own group with an existing rating renders it in the interactive row", () => {
    userRatings.value = [{ recipeId: "r1", rating: 4 }];
    const wrapper = build();
    expect(interactiveRow(wrapper)).toBeDefined();
  });

  test("public view renders the readonly group row instead — you cannot rate there", () => {
    isOwnGroup.value = false;
    const wrapper = build({}, 3.5);
    const ratings = wrapper.findAll(".v-rating");
    expect(ratings).toHaveLength(1);
    expect(ratings[0]!.classes()).toContain("v-rating--readonly");
  });
});

describe("rating updates", () => {
  test("setting a value persists it", async () => {
    const wrapper = build();
    const vm = wrapper.vm as unknown as { updateRating: (v?: number) => void };
    vm.updateRating(4);
    expect(setRating).toHaveBeenCalledWith("test-recipe", 4, null);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([4]);
  });

  test("clicking the current value again clears it — the clearable contract, preserved", () => {
    userRatings.value = [{ recipeId: "r1", rating: 4 }];
    const wrapper = build({}, 4);
    const vm = wrapper.vm as unknown as { updateRating: (v?: number) => void };
    vm.updateRating(4);
    expect(setRating).toHaveBeenCalledWith("test-recipe", 0, null);
  });

  test("half stars persist as halves — 3.5 goes to the API as 3.5", () => {
    const wrapper = build();
    const vm = wrapper.vm as unknown as { updateRating: (v?: number) => void };
    vm.updateRating(3.5);
    expect(setRating).toHaveBeenCalledWith("test-recipe", 3.5, null);
  });

  test("clicking the current HALF value clears it too", () => {
    userRatings.value = [{ recipeId: "r1", rating: 3.5 }];
    const wrapper = build({}, 3.5);
    const vm = wrapper.vm as unknown as { updateRating: (v?: number) => void };
    vm.updateRating(3.5);
    expect(setRating).toHaveBeenCalledWith("test-recipe", 0, null);
  });

  test("the interactive row accepts half increments", () => {
    const wrapper = build();
    const rating = wrapper.findComponent({ name: "VRating" });
    expect(rating.props("halfIncrements")).toBe(true);
  });

  test("public view never persists a rating", () => {
    isOwnGroup.value = false;
    const wrapper = build();
    const vm = wrapper.vm as unknown as { updateRating: (v?: number) => void };
    vm.updateRating(5);
    expect(setRating).not.toHaveBeenCalled();
  });
});

describe("model seeding — the clear-on-retap regression (found live 2026-08-10)", () => {
  test("THE BUG: persisted userRating=4 seeds the widget model on mount, not 0", () => {
    // Binding `undefined` let VRating's modelValue prop default (0) take over while the widget
    // was controlled: live model 0 against a persisted 4, so tapping the 4th star computed
    // 0 === 4 -> false and RE-SET the rating instead of clearing it.
    userRatings.value = [{ recipeId: "r1", rating: 4 }];
    const wrapper = build();
    expect(wrapper.findComponent({ name: "VRating" }).props("modelValue")).toBe(4);
  });

  test("the ratings GET resolving after mount still seeds the model", async () => {
    // Cold-starting the PWA straight onto a recipe page loads ratings asynchronously — the
    // widget must pick the value up when it lands, not only at setup.
    const wrapper = build();
    const rating = wrapper.findComponent({ name: "VRating" });
    expect(rating.props("modelValue")).toBe(0);
    userRatings.value = [{ recipeId: "r1", rating: 4 }];
    await wrapper.vm.$nextTick();
    expect(rating.props("modelValue")).toBe(4);
  });
});

describe("star colors — gold, not theme maroon", () => {
  test("filled stars resolve to the amber token, not `secondary`", () => {
    userRatings.value = [{ recipeId: "r1", rating: 4 }];
    const wrapper = build();
    expect(wrapper.findComponent({ name: "VRating" }).props("activeColor")).toBe("amber-darken-1");
    const buttons = wrapper.findAll(".v-rating .v-btn");
    expect(buttons.filter(b => b.classes().includes("text-amber-darken-1")).length).toBeGreaterThan(0);
    expect(buttons.filter(b => b.classes().includes("text-secondary")).length).toBe(0);
  });

  test("the readonly group row is gold too", () => {
    isOwnGroup.value = false;
    const wrapper = build({}, 3.5);
    expect(wrapper.findComponent({ name: "VRating" }).props("activeColor")).toBe("amber-darken-1");
  });
});

describe("hover ghost — hover preview only on hover-capable pointers", () => {
  test("touch: hover is off, so the display follows the model instead of a stuck mouseenter", () => {
    // jsdom is hover-incapable (matchMedia matches false), which IS the touch path. On touch,
    // tap fires mouseenter but never mouseleave, so VRating's hoverIndex sticks and the display
    // shows the ghost instead of the model — a successful clear still LOOKED filled.
    const wrapper = build();
    expect(wrapper.findComponent({ name: "VRating" }).props("hover")).toBe(false);
  });

  test("hover-capable pointers keep the hover preview", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({ matches: query === "(hover: hover)" }),
      configurable: true,
    });
    try {
      const wrapper = build();
      expect(wrapper.findComponent({ name: "VRating" }).props("hover")).toBe(true);
    }
    finally {
      Object.defineProperty(window, "matchMedia", { value: original, configurable: true });
    }
  });
});

describe("hideGroupRating — unsetting must not fall back to the stale group value", () => {
  test("once a user rating exists, the group value is suppressed", async () => {
    userRatings.value = [{ recipeId: "r1", rating: 4 }];
    const wrapper = build({}, 3.5);
    // Simulate the unset: rating removed after having been present.
    userRatings.value = [];
    await wrapper.vm.$nextTick();

    // Flip to the group branch to observe what it WOULD display: the guarded value is 0,
    // not the out-of-sync 3.5 group average.
    isOwnGroup.value = false;
    await wrapper.vm.$nextTick();
    const vm = wrapper.vm as unknown as { groupRating: number };
    expect(vm.groupRating).toBe(0);
  });
});
