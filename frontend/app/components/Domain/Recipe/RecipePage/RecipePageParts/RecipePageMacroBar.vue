<template>
  <div
    v-if="show"
    class="fork-macros"
  >
    <div class="fork-macros__card">
      <!-- Layout C: self-describing cells, no header. The kcal cell names the unit
           ("KCAL PER ROLL") and the hairline divider splits what you eat from what the
           batch makes ("ROLLS MADE"), so the numbers can't read as the whole batch. -->
      <div class="fork-macros__grid">
        <div
          v-for="cell in cells"
          :key="cell.key"
          class="fork-macro"
          :class="{ 'fork-macro--accent': cell.key === 'calories' }"
        >
          <div class="fork-macro__num">
            {{ cell.value }}<span class="fork-macro__unit">{{ cell.unit }}</span>
          </div>
          <div class="fork-macro__lbl">
            {{ cell.label }}
          </div>
        </div>

        <div class="fork-macro__div" />

        <div class="fork-macro fork-macro--accent">
          <div class="fork-macro__num">
            {{ servings }}
          </div>
          <div class="fork-macro__lbl">
            {{ madeLabel }}
          </div>
        </div>
      </div>
    </div>

    <div class="fork-actions">
      <v-btn
        class="fork-btn fork-btn--primary"
        :prepend-icon="$globals.icons.potSteam"
        @click="toggleCookMode()"
      >
        {{ $t("recipe.cook-mode") }}
      </v-btn>
      <v-btn
        v-if="sourceLabel"
        class="fork-btn"
        variant="outlined"
        :href="recipe.orgURL || undefined"
        :title="recipe.orgURL || undefined"
        target="_blank"
        rel="noopener noreferrer"
        :prepend-icon="$globals.icons.openInNew"
      >
        Open {{ sourceLabel }}
      </v-btn>
      <v-btn
        class="fork-btn"
        variant="outlined"
        :prepend-icon="$globals.icons.shareVariant"
        @click="onShare"
      >
        {{ $t("general.share") }}
      </v-btn>
    </div>
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

// Words whose singular already ends in -ie, so the plural is just +s. No rule can tell
// these from the y->ies family (candies->candy vs cookies->cookie share an ending), so
// they need an explicit set. Checked BEFORE the ies->y rule.
// Anything this list misses can be corrected per-recipe via extras.servingUnit.
const IE_SINGULARS = new Set([
  "cookie",
  "brownie",
  "blondie",
  "smoothie",
  "pie",
  "veggie",
  "hoagie",
  "pierogie",
  "sammie",
]);

function singularWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length > 3 && lower.endsWith("ies")) {
    // "cookies" -> "cookie" when the singular is a known -ie word, else "candies" -> "candy".
    if (IE_SINGULARS.has(lower.slice(0, -1))) {
      return word.slice(0, -1);
    }
    return `${word.slice(0, -3)}y`;
  }
  if (lower.length > 4 && /(?:sses|shes|ches|xes)$/.test(lower)) {
    return word.slice(0, -2);
  }
  if (lower.length > 2 && lower.endsWith("s") && !lower.endsWith("ss") && !lower.endsWith("us")) {
    return word.slice(0, -1);
  }
  return word;
}

// The head noun of a yield phrase sits before any preposition: "Sausages in Blanket" ->
// "Sausage in Blanket". Without a preposition it's the last word: "Pizza Slices" ->
// "Pizza Slice".
const PREPOSITIONS = new Set(["in", "on", "of", "with", "from", "per", "for"]);

function singularPhrase(phrase: string): string {
  const words = phrase.trim().split(/\s+/);
  if (!words.length) {
    return phrase;
  }
  const prepAt = words.findIndex(w => PREPOSITIONS.has(w.toLowerCase()));
  const head = prepAt > 0 ? prepAt - 1 : words.length - 1;
  words[head] = singularWord(words[head]!);
  return words.join(" ");
}

// Manual escape hatch for anything the guesser gets wrong (or any unit we've never seen).
// Set `servingUnit` in the recipe's API Extras (edit mode -> Advanced) to the singular
// noun, e.g. "Cookie", and it wins over auto-detection. No code change needed.
const unitOverride = computed(() => {
  const raw = (props.recipe.extras || {}).servingUnit;
  return typeof raw === "string" ? raw.trim() : "";
});

/** The name of ONE serving: "Sausage in Blanket", "Pizza Slice", else "serving". */
const unitLabel = computed(
  () => unitOverride.value || (yieldNoun.value ? singularPhrase(yieldNoun.value) : "serving"),
);

// Layout C: only the kcal cell names the unit; the divider + "X made" carry the rest.
const cells = computed(() =>
  macroCells.value.map(cell =>
    cell.key === "calories" ? { ...cell, label: `kcal per ${unitLabel.value}` } : cell,
  ),
);

/** "Rolls made" / "Sausages in Blanket made", else a plain "Servings". */
const madeLabel = computed(() =>
  yieldNoun.value ? `${yieldNoun.value} made` : i18n.t("recipe.servings"),
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
      // Deliberately URL-only (plus a title for the preview) — do NOT add `text`.
      // iOS maps navigator.share to UIActivityViewController: `url` becomes an NSURL
      // item and `text` an NSString item. With both present, receiving apps such as
      // MacroFactor grab the string and their "import from link" field lands empty.
      await share({ title, url });
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
.fork-macros__card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--fork-hair);
  border-radius: 20px;
  box-shadow: var(--fork-shadow-sm);
  padding: 20px 10px;
}

.fork-macros__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr) auto 1fr;
  /* start, not center: unit-naming labels wrap, and the numbers must stay on one line */
  align-items: start;
}

.fork-macro {
  text-align: center;
  padding: 0 6px;
  min-width: 0;
}

.fork-macro__num {
  font-family: var(--fork-font-display);
  font-weight: 540;
  font-size: clamp(1.6rem, 3.4vw, 2.35rem);
  line-height: 1;
  letter-spacing: -0.01em;
  font-variation-settings: "opsz" 40;
  color: rgb(var(--v-theme-on-surface));
}

.fork-macro--accent .fork-macro__num {
  color: rgb(var(--v-theme-primary));
}

.fork-macro__unit {
  font-family: var(--fork-font-sans);
  font-size: 0.48em;
  font-weight: 600;
  color: var(--fork-text-2);
  margin-left: 1px;
}

.fork-macro__lbl {
  margin-top: 9px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fork-text-3);
}

.fork-macro__div {
  width: 1px;
  height: 48px;
  background: var(--fork-hair);
  justify-self: center;
  align-self: center;
}

.fork-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.fork-btn.v-btn {
  height: 44px;
  border-radius: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: none;
  box-shadow: none;
}

.fork-btn--primary.v-btn {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

@media (max-width: 700px) {
  .fork-macros__grid {
    grid-template-columns: repeat(4, 1fr);
    row-gap: 16px;
  }
  .fork-macro__div {
    display: none;
  }
  /* the "X made" cell drops to its own full-width row under the macros */
  .fork-macro:last-child {
    grid-column: 1 / -1;
    padding-top: 14px;
    border-top: 1px solid var(--fork-hair);
  }
}
</style>
