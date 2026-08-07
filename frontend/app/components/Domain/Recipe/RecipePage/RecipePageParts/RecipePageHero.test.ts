// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { ref } from "vue";
import RecipePageHero from "./RecipePageHero.vue";

/**
 * The fourth nested gate on the rating feature: the hero FOOT wrapper didn't carry isOwnGroup,
 * so on a recipe with no description, no time and no rating (108 of 272 live), the
 * correctly-fixed rating rows inside had nowhere to mount. This mounts the hero with exactly
 * that recipe shape — "Vanilla Bean Protein FroYo": description empty, total_time None,
 * rating None — and asserts the rating control exists. The full gate chain is documented in
 * .claude/cowork-notes.md; if you add a layer to it, add it to this test's reasoning.
 */

const isOwnGroup = ref(true);

vi.mock("~/composables/use-logged-in-state", () => ({
  useLoggedInState: () => ({ isOwnGroup }),
}));

vi.mock("~/composables/api", () => ({
  useStaticRoutes: () => ({
    recipeImage: () => "",
    recipeSmallImage: () => "",
    recipeTinyImage: () => "",
  }),
}));

vi.mock("~/composables/recipe-page/shared-state", () => ({
  usePageState: () => ({
    imageKey: ref(1),
    isEditMode: ref(false),
    isCookMode: ref(false),
  }),
}));

const vuetify = createVuetify({ components, directives });

/** The FroYo shape: everything the old foot condition looked at is empty. */
function froyoRecipe(overrides: Record<string, unknown> = {}) {
  return {
    id: "r-froyo",
    slug: "vanilla-bean-protein-froyo",
    name: "Vanilla Bean Protein FroYo",
    description: "",
    totalTime: null,
    prepTime: null,
    performTime: null,
    rating: 0,
    image: null,
    recipeCategory: [],
    tags: [],
    settings: { showNutrition: false },
    ...overrides,
  };
}

function build(recipe = froyoRecipe()) {
  return mount(RecipePageHero, {
    props: { recipe: recipe as never },
    global: {
      plugins: [vuetify],
      stubs: {
        RecipePageHeroText: true,
        RecipePageMacroBar: true,
        SafeMarkdown: true,
        RecipeRating: { template: "<div class='rating-probe' />" },
      },
    },
  });
}

beforeEach(() => {
  isOwnGroup.value = true;
});

describe("RecipePageHero foot gate", () => {
  test("THE BUG: own group + no description/time/rating still mounts the rating control", () => {
    const wrapper = build();
    expect(wrapper.find(".fork-hero__foot").exists()).toBe(true);
    expect(wrapper.find(".rating-probe").exists()).toBe(true);
  });

  test("the newly-rendered foot is never empty — it contains the rating row", () => {
    const wrapper = build();
    const foot = wrapper.find(".fork-hero__foot");
    expect(foot.find(".fork-hero__meta").exists()).toBe(true);
    expect(foot.find(".rating-probe").exists()).toBe(true);
  });

  test("public view with the same empty recipe keeps the foot hidden — nothing to show, nothing to rate", () => {
    isOwnGroup.value = false;
    const wrapper = build();
    expect(wrapper.find(".fork-hero__foot").exists()).toBe(false);
    expect(wrapper.find(".rating-probe").exists()).toBe(false);
  });

  test("public view with a rating still shows it, readonly-style path", () => {
    isOwnGroup.value = false;
    const wrapper = build(froyoRecipe({ rating: 3.5 }));
    expect(wrapper.find(".fork-hero__foot").exists()).toBe(true);
    expect(wrapper.find(".rating-probe").exists()).toBe(true);
  });
});
