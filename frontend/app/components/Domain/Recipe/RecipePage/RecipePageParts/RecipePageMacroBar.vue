<template>
  <div
    v-if="show"
    class="mb-4"
  >
    <v-sheet
      rounded="lg"
      border
      class="px-3 py-2"
    >
      <!-- Macro row: kcal / protein / carbs / fat, then servings (visually separated) -->
      <div class="d-flex align-center text-center">
        <div
          v-for="cell in macroCells"
          :key="cell.key"
          class="flex-grow-1"
          style="flex-basis: 0"
        >
          <div class="macro-value">
            {{ cell.value }}<span class="macro-unit">{{ cell.unit }}</span>
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ cell.label }}
          </div>
        </div>

        <v-divider
          vertical
          class="mx-1 align-self-stretch"
        />

        <div
          class="flex-grow-1"
          style="flex-basis: 0"
        >
          <div class="macro-value">
            {{ servings }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ servingsLabel }}
          </div>
        </div>
      </div>

      <v-divider class="my-2" />

      <!-- Action row: Open source / Share / Cook, with the per-serving hint on the right -->
      <div class="d-flex align-center flex-wrap ga-1">
        <v-btn
          v-if="sourceLabel"
          :href="recipe.orgURL || undefined"
          :title="recipe.orgURL || undefined"
          target="_blank"
          rel="noopener noreferrer"
          variant="tonal"
          size="small"
          :prepend-icon="$globals.icons.openInNew"
        >
          Open {{ sourceLabel }}
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          :prepend-icon="$globals.icons.shareVariant"
          @click="onShare"
        >
          {{ $t("general.share") }}
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          :prepend-icon="$globals.icons.potSteam"
          @click="toggleCookMode()"
        >
          {{ $t("recipe.cook-mode") }}
        </v-btn>

        <span class="ml-auto text-caption text-medium-emphasis">
          {{ perLabel }}
        </span>
      </div>
    </v-sheet>
  </div>
</template>

<script setup lang="ts">
import { useClipboard, useShare } from "@vueuse/core";
import { usePageState } from "~/composables/recipe-page/shared-state";
import { getMacroCells } from "~/composables/recipes/use-macro-summary";
import { alert } from "~/composables/use-toast";
import type { NoUndefinedField } from "~/lib/api/types/non-generated";
import type { Recipe } from "~/lib/api/types/recipe";

const props = defineProps<{ recipe: NoUndefinedField<Recipe> }>();

const i18n = useI18n();
const route = useRoute();
const auth = useMealieAuth();
const { isCookMode, isEditMode, toggleCookMode } = usePageState(props.recipe.slug);

const groupSlug = computed(
  () => (route.params.groupSlug as string) || auth.user?.value?.groupSlug || "",
);

const macroCells = computed(() => getMacroCells(props.recipe.nutrition));

const servings = computed<number>(
  () => props.recipe.recipeServings || props.recipe.recipeYieldQuantity || 1,
);

/** The yield noun ("slices"), with any leading quantity stripped ("8 slices" -> "slices"). */
const yieldNoun = computed(
  () => (props.recipe.recipeYield || "").replace(/^[\d.\s]+/, "").trim(),
);

const servingsLabel = computed(() => yieldNoun.value || i18n.t("recipe.servings"));

/** Light singularization for the "per X" hint: "slices" -> "slice". */
function singular(noun: string): string {
  const lower = noun.toLowerCase();
  if (noun.length > 3 && lower.endsWith("s") && !lower.endsWith("ss")) {
    return noun.slice(0, -1);
  }
  return noun;
}

const perLabel = computed(() =>
  yieldNoun.value ? `per ${singular(yieldNoun.value)}` : "per serving",
);

// Short labels for hosts we import from often; anything else falls back to the
// capitalized registrable domain ("skinnytaste.com" -> "Skinnytaste").
const KNOWN_SOURCES: Record<string, string> = {
  "flexibledietinglifestyle.com": "FDL",
};
const SECOND_LEVEL_TLDS = new Set(["co", "com", "net", "org", "gov", "ac", "edu"]);

const sourceLabel = computed(() => {
  const url = props.recipe.orgURL;
  if (!url) {
    return "";
  }
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    for (const [domain, label] of Object.entries(KNOWN_SOURCES)) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return label;
      }
    }
    const parts = host.split(".");
    let i = parts.length - 2;
    if (i > 0 && parts.length >= 3 && SECOND_LEVEL_TLDS.has(parts[i]!)) {
      i -= 1;
    }
    const label = parts[Math.max(i, 0)] || "";
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : "source";
  }
  catch {
    return "source";
  }
});

const show = computed(
  () =>
    props.recipe.settings.showNutrition
    && macroCells.value.length > 0
    && !isCookMode.value
    && !isEditMode.value,
);

// Share directly via the Web Share API against the public recipe URL, bypassing
// the token dialog. Falls back to copying the link when sharing isn't supported.
const { share, isSupported: shareIsSupported } = useShare();
const { copy, isSupported: clipboardIsSupported } = useClipboard();

async function onShare() {
  const url = `${window.location.origin}/g/${groupSlug.value}/r/${props.recipe.slug}`;
  const title = props.recipe.name || "";

  if (shareIsSupported.value) {
    try {
      await share({ title, url, text: title });
    }
    catch {
      // User dismissed the share sheet; nothing to do.
    }
    return;
  }

  if (clipboardIsSupported.value) {
    await copy(url);
    alert.success(i18n.t("recipe-share.recipe-link-copied-message") as string);
  }
  else {
    alert.error(i18n.t("general.clipboard-not-supported") as string);
  }
}
</script>

<style lang="scss" scoped>
.macro-value {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.2;
}

.macro-unit {
  font-size: 14px;
  font-weight: 500;
}
</style>
