// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { ref } from "vue";
import RecipeCardRatingMenu from "./RecipeCardRatingMenu.vue";

/**
 * The card-level tap-to-rate: a single star chip opens a menu with the full-size rating
 * control. Exists because "rate it from the card" on a phone must be one tap, not a
 * navigate-then-find-the-stars expedition.
 */

const isOwnGroup = ref(true);
const userRatings = ref<{ recipeId: string; rating: number }[]>([]);

vi.mock("~/composables/use-logged-in-state", () => ({
  useLoggedInState: () => ({ isOwnGroup }),
}));

vi.mock("~/composables/use-users", () => ({
  useUserSelfRatings: () => ({ userRatings, setRating: vi.fn(), ready: ref(true) }),
}));

const vuetify = createVuetify({ components, directives });

function build(props: Record<string, unknown> = {}) {
  return mount(RecipeCardRatingMenu, {
    props: { recipeId: "r1", slug: "test-recipe", ...props },
    slots: {
      activator: `<template #activator="{ props: p, label, chipText, rated }">
        <button class="probe" v-bind="p">{{ rated ? "R" : "U" }}|{{ label }}|{{ chipText }}</button>
      </template>`,
    },
    global: { plugins: [vuetify] },
  });
}

beforeEach(() => {
  isOwnGroup.value = true;
  userRatings.value = [];
});

describe("RecipeCardRatingMenu", () => {
  // A bare hollow star did NOT read as an affordance — Ethan looked straight at it and said
  // "I don't see any stars". The only textless badge on the card read as decoration.
  test("STATE 1 — nobody has rated: the chip says 'Rate'", () => {
    const wrapper = build();
    expect(wrapper.find(".probe").text()).toBe("U||Rate");
  });

  test("STATE 3 — the user's own rating wins the chip label over the group average", () => {
    userRatings.value = [{ recipeId: "r1", rating: 4.5 }];
    const wrapper = build({ groupRating: 3 });
    expect(wrapper.find(".probe").text()).toBe("R|4.5|4.5");
  });

  test("STATE 2 — group rated, user hasn't: the number shows (muted via rated=false), NOT 'Rate'", () => {
    const wrapper = build({ groupRating: 3.5 });
    expect(wrapper.find(".probe").text()).toBe("U|3.5|3.5");
  });

  test("public view renders nothing — a control you cannot use is a broken button", () => {
    isOwnGroup.value = false;
    const wrapper = build({ groupRating: 4 });
    expect(wrapper.find(".probe").exists()).toBe(false);
  });

  test("opening the menu mounts the real interactive rating control", async () => {
    const wrapper = build();
    await wrapper.find(".probe").trigger("click");
    await new Promise(resolve => setTimeout(resolve, 100));
    await wrapper.vm.$nextTick();
    // v-menu teleports its content to document.body, outside the wrapper's tree.
    const rating = document.body.querySelector(".v-rating");
    expect(rating).not.toBeNull();
    expect(document.body.textContent).toContain("Rate this recipe");
  });
});
