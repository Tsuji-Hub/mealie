<template>
  <div>
    <!-- Edit Dialog -->
    <BaseDialog
      v-if="editTarget"
      v-model="dialogStates.edit"
      width="100%"
      max-width="1100px"
      :icon="$globals.icons.pages"
      :title="$t('general.edit')"
      :submit-icon="$globals.icons.save"
      :submit-text="$t('general.save')"
      :submit-disabled="!editTarget.queryFilterString"
      can-submit
      @submit="editCookbook"
    >
      <v-card-text>
        <CookbookEditor
          v-model="editTarget"
        />
      </v-card-text>
    </BaseDialog>

    <v-container
      v-if="book"
      class="my-0"
    >
      <v-sheet
        color="transparent"
        class="d-flex flex-column w-100 pa-0 ma-0"
        elevation="0"
      >
        <div class="d-flex align-center w-100 mb-2">
          <v-toolbar-title class="headline mb-0">
            <v-icon size="large" class="mr-3">
              {{ $globals.icons.pages }}
            </v-icon>
            {{ book.name }}
          </v-toolbar-title>
          <BaseButton
            v-if="canEdit"
            class="mx-1"
            :edit="true"
            @click="handleEditCookbook"
          />
        </div>
        <div v-if="book.description" class="subtitle-1 text-grey-lighten-1 mb-2">
          {{ book.description }}
        </div>
      </v-sheet>

      <v-container class="pa-0">
        <RecipeCardSection
          class="mb-5 mx-1"
          :recipes="recipes"
          :query="{ cookbook: slug }"
          @sort-recipes="assignSorted"
          @replace-recipes="replaceRecipes"
          @append-recipes="appendRecipes"
          @delete="removeRecipe"
          @category-removed="onCategoryRemoved"
        />
      </v-container>
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { useLazyRecipes } from "~/composables/recipes";
import RecipeCardSection from "@/components/Domain/Recipe/RecipeCardSection.vue";
import { useCookbookStore } from "~/composables/store/use-cookbook-store";
import { useCookbook } from "~/composables/use-group-cookbooks";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import type { ReadCookBook } from "~/lib/api/types/cookbook";
import type { RecipeCategory } from "~/lib/api/types/recipe";
import CookbookEditor from "~/components/Domain/Cookbook/CookbookEditor.vue";

const auth = useMealieAuth();
const { isOwnGroup } = useLoggedInState();

const route = useRoute();
const groupSlug = computed(() => route.params.groupSlug as string || auth.user.value?.groupSlug || "");

const { recipes, appendRecipes, assignSorted, removeRecipe, replaceRecipes } = useLazyRecipes(isOwnGroup.value ? null : groupSlug.value);
const slug = route.params.slug as string;
const { getOne } = useCookbook(isOwnGroup.value ? null : groupSlug.value);
const { actions } = useCookbookStore();
const router = useRouter();

const book = getOne(slug);

/**
 * Is THIS cookbook scoped by the given category? The card can't know this — only the page
 * holds `book`. The filter is already parsed server-side (`queryFilter.parts`), so we read
 * it rather than re-implementing the DSL.
 *
 * Recognises only the narrow, unambiguous shape: a single bare part on
 * `recipe_category.name` with IN/=. Anything else — parens, OR, extra clauses, a tag/tool
 * filter — returns false and the card simply stays.
 * The costs are asymmetric: a stale card is what Ethan has today and a refresh fixes it;
 * wrongly vanishing one looks like data loss and he'd have no idea why. Bias to doing nothing.
 *
 * Do NOT guard on `recipeCount` here. It says nothing about whether this cookbook is scoped
 * by a category — that is entirely `queryFilter.parts`. It's also only stitched onto the LIST
 * route; this page loads via getOne, where it is always null, so guarding on it disabled the
 * whole feature silently (no error, just a vanish that never fired). Every guard in here must
 * test something that actually bears on the question.
 */
function isScopedByCategory(category: RecipeCategory): boolean {
  const cookbook = book.value;
  if (!cookbook) {
    return false;
  }

  const parts = cookbook.queryFilter?.parts;
  if (!parts || parts.length !== 1) {
    return false;
  }

  const part = parts[0];
  if (!part || part.leftParenthesis || part.rightParenthesis || part.logicalOperator) {
    return false;
  }
  // Match on the category NAME: every cookbook filters on recipe_category.name with the name
  // string, not a UUID. Matching on id finds nothing and the vanish silently never fires.
  // Compare exactly — names carry emoji, apostrophes, parens and "<".
  if (part.attributeName !== "recipe_category.name") {
    return false;
  }

  const operator = String(part.relationalOperator || "").toUpperCase();
  if (operator !== "IN" && operator !== "=") {
    return false;
  }

  const values = Array.isArray(part.value) ? part.value : part.value == null ? [] : [part.value];
  return values.includes(category.name);
}

// Unfiled from a category. If that category is what scopes this view, the recipe no longer
// belongs here — drop the card. It is NOT deleted: it still exists and keeps its other
// cookbooks. Fired only after the PATCH succeeded, so there's nothing to undo.
function onCategoryRemoved(recipeSlug: string, category: RecipeCategory) {
  if (isScopedByCategory(category)) {
    removeRecipe(recipeSlug);
  }
}

const isOwnHousehold = computed(() => {
  if (!(auth.user.value && book.value?.householdId)) {
    return false;
  }

  return auth.user.value.householdId === book.value.householdId;
});
const canEdit = computed(() => isOwnGroup.value && isOwnHousehold.value);

const dialogStates = reactive({
  edit: false,
});

const editTarget = ref<ReadCookBook | null>(null);
function handleEditCookbook() {
  dialogStates.edit = true;
  editTarget.value = book.value;
}

async function editCookbook() {
  if (!editTarget.value) {
    return;
  }
  const response = await actions.updateOne(editTarget.value);

  if (response?.slug && book.value?.slug !== response?.slug) {
    // if name changed, redirect to new slug
    router.push(`/g/${route.params.groupSlug}/cookbooks/${response?.slug}`);
  }
  else {
    // otherwise reload the page, since the recipe criteria changed
    router.go(0);
  }
  dialogStates.edit = false;
  editTarget.value = null;
}

useSeoMeta({
  title: book?.value?.name || "Cookbook",
});
</script>
