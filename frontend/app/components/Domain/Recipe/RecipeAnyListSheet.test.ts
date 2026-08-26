// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

// Mutable so the pinned-install test can swap in a single-entry /lists response.
const listsHolder = vi.hoisted(() => ({ names: ["Groceries", "Costco"] }));

vi.mock("~/composables/api", () => ({
  useUserApi: () => ({ anylist: { send: sendMock, getLists: vi.fn(async () => ({ data: { lists: listsHolder.names } })) } }),
}));

vi.mock("~/composables/recipes/use-anylist", () => ({
  useAnyList: () => ({
    available: ref(true),
    lists: { get value() { return listsHolder.names; } },
    probeAtIdle: vi.fn(),
    refreshLists: vi.fn(async () => listsHolder.names),
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

// v-dialog teleports into document.body and STAYS there after a test — without cleanup,
// later tests' queries silently hit the previous test's stale sheet.
let activeWrapper: ReturnType<typeof mount> | null = null;

function build(scale: number) {
  activeWrapper = mount(RecipeAnyListSheet, {
    props: { recipe, scale, modelValue: true },
    global: { plugins: [vuetify] },
  });
  return activeWrapper as ReturnType<typeof mount<typeof RecipeAnyListSheet>>;
}

beforeEach(() => {
  sendMock.mockReset();
  listsHolder.names = ["Groceries", "Costco"];
  window.localStorage.clear();
});

afterEach(() => {
  activeWrapper?.unmount();
  activeWrapper = null;
  document.body.innerHTML = "";
});

interface SheetVm {
  send: () => Promise<void>;
  toggleAll: () => void;
  checkedLines: string[];
  singleListMode: boolean;
}

async function settle(wrapper: ReturnType<typeof build>) {
  await wrapper.vm.$nextTick();
  await new Promise(r => setTimeout(r, 0)); // let the open-watcher's async refresh settle
}

describe("RecipeAnyListSheet", () => {
  test("lines are the scaled display strings at the active scale, ALL UNCHECKED (opt-in)", async () => {
    const wrapper = build(0.5);
    await settle(wrapper);

    // v-dialog teleports to body
    const text = document.body.textContent || "";
    expect(text).toContain("20 g All Purpose Flour");
    expect(text).toContain("¾ lb Chicken Breast");
    expect(text).toContain("Salt to taste");

    const boxes = document.body.querySelectorAll(".fork-anylist__item input[type='checkbox']");
    expect(boxes.length).toBe(3);
    for (const box of boxes) {
      expect((box as HTMLInputElement).checked).toBe(false);
    }
  });

  test("send is disabled at 0 selected, and the button carries a live count", async () => {
    const wrapper = build(0.5);
    await settle(wrapper);

    const sendBtn = [...document.body.querySelectorAll(".fork-anylist button")]
      .find(b => /Send \d+ item/.test(b.textContent || "")) as HTMLButtonElement;
    expect(sendBtn).toBeTruthy();
    expect(sendBtn.textContent).toContain("Send 0 items");
    expect(sendBtn.disabled).toBe(true);

    const vm = wrapper.vm as unknown as SheetVm;
    vm.toggleAll();
    await wrapper.vm.$nextTick();
    expect(sendBtn.textContent).toContain("Send 3 items");
    expect(sendBtn.disabled).toBe(false);
  });

  test("the master toggle drives all -> none, and send() at 0 is a no-op", async () => {
    sendMock.mockResolvedValue({ data: { results: [], sent: 0, failed: 0 }, error: null });
    const wrapper = build(0.5);
    await settle(wrapper);
    const vm = wrapper.vm as unknown as SheetVm;

    vm.toggleAll();
    await wrapper.vm.$nextTick();
    expect(vm.checkedLines).toHaveLength(3);
    vm.toggleAll();
    await wrapper.vm.$nextTick();
    expect(vm.checkedLines).toHaveLength(0);

    await vm.send();
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("send posts exactly the checked scaled lines to the chosen list", async () => {
    sendMock.mockResolvedValue({
      data: { results: [], sent: 3, failed: 0 },
      error: null,
    });
    const wrapper = build(0.5);
    await settle(wrapper);

    const vm = wrapper.vm as unknown as SheetVm;
    vm.toggleAll(); // opt-in: select everything explicitly
    await wrapper.vm.$nextTick();
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
    await settle(wrapper);

    const vm = wrapper.vm as unknown as SheetVm;
    vm.toggleAll();
    await wrapper.vm.$nextTick();
    await vm.send();

    sendMock.mockResolvedValueOnce({ data: { results: [], sent: 1, failed: 0 }, error: null });
    await vm.send(); // retry
    const [retryItems] = sendMock.mock.calls[1]!;
    expect(retryItems).toEqual(["¾ lb Chicken Breast"]);
  });

  test("pinned install (single-entry /lists): static label, no picker, no last-used memory", async () => {
    listsHolder.names = ["Shared Grocery List"];
    sendMock.mockResolvedValue({ data: { results: [], sent: 1, failed: 0 }, error: null });

    const wrapper = build(0.5);
    await settle(wrapper);

    const vm = wrapper.vm as unknown as SheetVm;
    expect(vm.singleListMode).toBe(true);
    expect((document.body.querySelector(".fork-anylist__pinned") || {}).textContent).toContain("→ Shared Grocery List");
    expect(document.body.querySelector(".fork-anylist .v-select")).toBeNull();

    vm.toggleAll();
    await wrapper.vm.$nextTick();
    await vm.send();
    const [, list] = sendMock.mock.calls[0]!;
    expect(list).toBe("Shared Grocery List");
    // No last-used memory in pinned mode — there is nothing to remember.
    expect(window.localStorage.getItem("fork.anylist.lastList")).toBeNull();
  });
});
