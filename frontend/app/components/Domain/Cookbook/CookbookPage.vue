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

    <!-- NOT gated on `book`. It used to be, and the cost was double: nothing painted until the
         cookbook XHR resolved (a black content area on every sidebar click), and
         RecipeCardSection wasn't mounted until then either, so the recipes fetch queued BEHIND
         the cookbook fetch. Its query only needs the route slug, so both requests now run in
         parallel and the page paints before either lands. -->
    <v-container class="my-0">
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
            <span v-if="book">{{ book.name }}</span>
            <span v-else class="fork-title-skel" aria-hidden="true" />
          </v-toolbar-title>
          <BaseButton
            v-if="canEdit"
            class="mx-1"
            :edit="true"
            @click="handleEditCookbook"
          />
        </div>
        <div v-if="book?.description" class="subtitle-1 text-grey-lighten-1 mb-2">
          {{ book.description }}
        </div>
      </v-sheet>

      <v-container class="pa-0">
        <RecipeCardSection
          class="mb-5 mx-1"
          :recipes="recipes"
          :query="{ cookbook: slug }"
          :cache-scope="cacheScope"
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
import { isScopedByCategory } from "~/composables/cookbooks/use-cookbook-scope";
import { cookbookListScope } from "~/composables/recipes/use-list-cache";
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

// SWR scope for the grid: a revisit paints the cached cards instantly and revalidates behind
// them. Built by the shared helper so the prefetcher warms exactly this key.
const cacheScope = computed(() => cookbookListScope(isOwnGroup.value, groupSlug.value, slug));

// Unfiled from a category. If that category is what scopes this view, the recipe no longer
// belongs here — drop the card. It is NOT deleted: it still exists and keeps its other
// cookbooks. Fired only after the PATCH succeeded, so there's nothing to undo.
//
// The decision needs `book`, which only this page holds — but the question itself is pure,
// so it lives in use-cookbook-scope.ts where a test can pin it.
function onCategoryRemoved(recipeSlug: string, category: RecipeCategory) {
  if (isScopedByCategory(book.value, category)) {
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

<style lang="scss" scoped>
/* Placeholder for the cookbook name while its fetch is in flight — same shimmer as the card
   skeletons, sized to a typical one-word title so the header doesn't jump when the name lands. */
.fork-title-skel {
  display: inline-block;
  width: 130px;
  height: 22px;
  border-radius: 8px;
  vertical-align: middle;
  background: linear-gradient(
    100deg,
    var(--fork-hair) 40%,
    color-mix(in srgb, var(--fork-hair) 45%, transparent) 50%,
    var(--fork-hair) 60%
  );
  background-size: 200% 100%;
  animation: fork-skel-shimmer 1.4s ease-in-out infinite;
}

@keyframes fork-skel-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -80% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fork-title-skel {
    animation: none;
  }
}
</style>
