// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { ref } from "vue";
import RecipeAnyListSheet from "./RecipeAnyListSheet.vue";
import { scaleIngredientNote } from "~/composables/recipes/use-note-scaler";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe } from "~/lib/api/types/recipe";

/**
 * The contract under test: the sheet's lines are the SAME scaled display strings the
 * ingredient list shows (the PROMPT M scaler at the active scale chip), all pre-checked,
 * verbatim — no clever splitting.
 */

const sendMock = vi.fn();

vi.mock("~/composables/api", () => ({
  useUserApi: () => ({ anylist: { send: sendMock, getLists: vi.fn(async () => ({ data: { lists: ["Groceries"] } })) } }),
}));

vi.mock("~/composables/recipes/use-anylist", () => ({
  useAnyList: () => ({
    available: ref(true),
    lists: ref(["Groceries", "Costco"]),
    probeAtIdle: vi.fn(),
    refreshLists: vi.fn(async () => ["Groceries", "Costco"]),
  }),
}));

// The real text parser drags in locale composables; mimic its unparsed-note path with the
// REAL scaler so the scale flow stays under test.
vi.mock("~/composables/recipes", () => ({
  useIngredientTextParser: () => ({
    parseIngredientText: (ingredient: { note?: string }, scale: number) =>
      scaleIngredientNote(ingredient.note || "", scale),
  }),
}));

vi.mock("~/composables/use-toast", () => ({
  alert: { success: vi.fn(), error: vi.fn() },
}));

const vuetify = createVuetify({ components, directives });

const recipe = {
  slug: "sauce",
  recipeIngredient: [
    { note: "40 g All Purpose Flour" },
    { note: "1.5 lb Chicken Breast" },
    { note: "Salt to taste" },
  ],
} as unknown as NoUndefinedField<Recipe>;

function build(scale: number) {
  return mount(RecipeAnyListSheet, {
    props: { recipe, scale, modelValue: true },
    global: { plugins: [vuetify] },
  });
}

beforeEach(() => {
  sendMock.mockReset();
  window.localStorage.clear();
});

describe("RecipeAnyListSheet", () => {
  test("lines are the scaled display strings at the active scale, all pre-checked", async () => {
    const wrapper = build(0.5);
    await wrapper.vm.$nextTick();
    await new Promise(r => setTimeout(r, 0)); // let the open-watcher's async refresh settle

    // v-dialog teleports to body
    const text = document.body.textContent || "";
    expect(text).toContain("20 g All Purpose Flour");
    expect(text).toContain("¾ lb Chicken Breast");
    expect(text).toContain("Salt to taste");

    const boxes = document.body.querySelectorAll(".fork-anylist__item input[type='checkbox']");
    expect(boxes.length).toBe(3);
    for (const box of boxes) {
      expect((box as HTMLInputElement).checked).toBe(true);
    }
  });

  test("send posts exactly the checked scaled lines to the chosen list", async () => {
    sendMock.mockResolvedValue({
      data: { results: [], sent: 3, failed: 0 },
      error: null,
    });
    const wrapper = build(0.5);
    await wrapper.vm.$nextTick();
    await new Promise(r => setTimeout(r, 0));

    const vm = wrapper.vm as unknown as { send: () => Promise<void> };
    await vm.send();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [items, list] = sendMock.mock.calls[0]!;
    expect(items).toEqual(["20 g All Purpose Flour", "¾ lb Chicken Breast", "Salt to taste"]);
    expect(list).toBe("Groceries");
    expect(window.localStorage.getItem("fork.anylist.lastList")).toBe("Groceries");
  });

  test("partial failure keeps failed items visible for retry, and retry sends only those", async () => {
    sendMock.mockResolvedValueOnce({
      data: {
        results: [
          { item: "20 g All Purpose Flour", ok: true },
          { item: "¾ lb Chicken Breast", ok: false, error: "AnyList rejected (500)" },
          { item: "Salt to taste", ok: true },
        ],
        sent: 2,
        failed: 1,
      },
      error: null,
    });
    const wrapper = build(0.5);
    await wrapper.vm.$nextTick();
    await new Promise(r => setTimeout(r, 0));

    const vm = wrapper.vm as unknown as { send: () => Promise<void> };
    await vm.send();

    sendMock.mockResolvedValueOnce({ data: { results: [], sent: 1, failed: 0 }, error: null });
    await vm.send(); // retry
    const [retryItems] = sendMock.mock.calls[1]!;
    expect(retryItems).toEqual(["¾ lb Chicken Breast"]);
  });
});
