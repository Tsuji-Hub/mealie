<template>
  <v-dialog
    v-model="open"
    max-width="480"
    transition="dialog-bottom-transition"
    content-class="fork-anylist-sheet"
  >
    <v-card class="fork-anylist">
      <v-card-title class="fork-anylist__title">
        Send to AnyList
      </v-card-title>

      <v-card-text class="pt-0">
        <!-- The lines are the PROMPT M display strings at the CURRENT scale, verbatim.
             No smart splitting or cleanup: a wrong "clever" parse on a grocery list wastes
             Mom's time; verbatim never lies. -->
        <div class="fork-anylist__items">
          <label
            v-for="(line, index) in lines"
            :key="index"
            class="fork-anylist__item"
          >
            <v-checkbox-btn
              v-model="checked[index]"
              density="compact"
              class="mr-1 flex-0-0"
            />
            <span :class="{ 'fork-anylist__item--failed': failedItems.has(line) }">{{ line }}</span>
          </label>
        </div>

        <v-select
          v-model="selectedList"
          :items="listOptions"
          label="AnyList list"
          density="compact"
          variant="outlined"
          hide-details
          class="mt-4"
        />

        <div v-if="failedItems.size" class="fork-anylist__error">
          {{ failedItems.size }} item(s) failed — they stay checked; Retry sends only those.
        </div>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="open = false">
          Cancel
        </v-btn>
        <v-btn
          class="fork-btn fork-btn--primary"
          :loading="sending"
          :disabled="!selectedList || checkedLines.length === 0"
          @click="send"
        >
          {{ failedItems.size ? "Retry failed" : `Send ${checkedLines.length}` }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { useAnyList } from "~/composables/recipes/use-anylist";
import { useIngredientTextParser } from "~/composables/recipes";
import { useUserApi } from "~/composables/api";
import { alert } from "~/composables/use-toast";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe } from "~/lib/api/types/recipe";

const props = defineProps<{
  recipe: NoUndefinedField<Recipe>;
  /** The active PROMPT M scale — sent lines match what the user sees on screen. */
  scale: number;
}>();

const open = defineModel<boolean>({ default: false });

const api = useUserApi();
const { lists, refreshLists } = useAnyList();
const { parseIngredientText } = useIngredientTextParser();

const LAST_LIST_KEY = "fork.anylist.lastList";

// Plain-text form of every ingredient line at the CURRENT scale (the same strings the
// ingredient list shows, minus HTML formatting).
const lines = computed(() =>
  (props.recipe.recipeIngredient || [])
    .map(ingredient => parseIngredientText(ingredient, props.scale, false))
    .filter(line => !!line.trim()),
);

const checked = ref<boolean[]>([]);
const sending = ref(false);
const failedItems = ref<Set<string>>(new Set());
const selectedList = ref<string>("");
const listOptions = ref<string[]>([]);

watch(open, async (isOpen) => {
  if (!isOpen) {
    return;
  }
  await prepareSheet();
}, { immediate: true });

async function prepareSheet() {
  // Everything pre-checked on open (uncheck what you already have); failures reset.
  checked.value = lines.value.map(() => true);
  failedItems.value = new Set();
  listOptions.value = lists.value;
  const remembered = typeof window !== "undefined" ? window.localStorage.getItem(LAST_LIST_KEY) : null;
  selectedList.value = remembered && lists.value.includes(remembered) ? remembered : (lists.value[0] ?? "");
  // Sheet lazy-loads fresh data on open (perf guardrail: nothing fetched before then).
  const fresh = await refreshLists();
  listOptions.value = fresh;
  if (!selectedList.value && fresh.length) {
    const rememberedName = typeof window !== "undefined" ? window.localStorage.getItem(LAST_LIST_KEY) : null;
    selectedList.value = rememberedName && fresh.includes(rememberedName) ? rememberedName : fresh[0]!;
  }
}

const checkedLines = computed(() => lines.value.filter((_, index) => checked.value[index]));

async function send() {
  if (!selectedList.value || checkedLines.value.length === 0) {
    return;
  }
  sending.value = true;
  const toSend = failedItems.value.size
    ? checkedLines.value.filter(line => failedItems.value.has(line))
    : checkedLines.value;

  const { data, error } = await api.anylist.send(toSend, selectedList.value);
  sending.value = false;

  if (error || !data) {
    alert.error("AnyList bridge unreachable — nothing was sent.");
    return;
  }

  try {
    window.localStorage.setItem(LAST_LIST_KEY, selectedList.value);
  }
  catch { /* storage full/blocked — remembering the list is a nicety */ }

  const failures = new Set(data.results.filter(result => !result.ok).map(result => result.item));
  failedItems.value = failures;

  if (failures.size === 0) {
    alert.success(`${data.sent} item${data.sent === 1 ? "" : "s"} → ${selectedList.value}`);
    open.value = false;
  }
  else {
    alert.error(`${data.sent} sent, ${failures.size} failed — retry sends only the failures.`);
  }
}
</script>

<style lang="scss" scoped>
.fork-anylist__title {
  font-size: 16px;
  font-weight: 700;
}

.fork-anylist__items {
  max-height: 45vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.fork-anylist__item {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 14px;
  line-height: 1.35;
  padding: 2px 0;
  cursor: pointer;
}

.fork-anylist__item--failed {
  color: rgb(var(--v-theme-error));
}

.fork-anylist__error {
  margin-top: 10px;
  font-size: 12.5px;
  color: rgb(var(--v-theme-error));
}
</style>

<style lang="scss">
/* Bottom-sheet placement without a new component dependency: the dialog hugs the bottom
   edge on phones, where this flow lives. */
.fork-anylist-sheet {
  align-self: flex-end;
  margin-bottom: 0 !important;
  border-radius: 16px 16px 0 0;
}
</style>
