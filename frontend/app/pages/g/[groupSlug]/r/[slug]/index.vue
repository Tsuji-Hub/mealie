<template>
  <div>
    <RecipePage
      v-if="recipe"
      v-model="recipe"
    />
  </div>
</template>

<script setup lang="ts">
import { whenever } from "@vueuse/core";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import RecipePage from "~/components/Domain/Recipe/RecipePage/RecipePage.vue";
import { usePublicExploreApi } from "~/composables/api/api-client";
import { useRecipe } from "~/composables/recipes";
import type { Recipe } from "~/lib/api/types/recipe";

const auth = useMealieAuth();
const { isOwnGroup } = useLoggedInState();
const route = useRoute();
const title = ref(route.meta?.title as string || "");
useSeoMeta({ title });

const router = useRouter();
const slug = route.params.slug as string;

const recipe = ref<Recipe | null>(null);
function loadRecipe() {
  const { recipe: data } = useRecipe(slug);
  watch(data, (value) => {
    recipe.value = value;
  });
}

// Plain fetch, NOT useAsyncData(useAsyncKey()): the random key registered a permanent entry in
// Nuxt's payload registry per recipe visit — nothing could ever reuse or free it, so a browsing
// session leaked one retained payload per recipe opened, forever. This was THE leak behind
// "the site gets slower the longer I click, and a tab left overnight is frozen." With ssr:false
// useAsyncData buys nothing here; a direct call keeps identical behavior with zero entries.
async function loadPublicRecipe() {
  const groupSlug = computed(() => route.params.groupSlug as string || auth.user.value?.groupSlug || "");
  const api = usePublicExploreApi(groupSlug.value);
  const { data, error } = await api.explore.recipes.getOne(slug);
  if (error) {
    console.error("error loading recipe -> ", error);
    router.push(`/g/${groupSlug.value}`);
  }
  recipe.value = data;
}

if (isOwnGroup.value) {
  loadRecipe();
}
else {
  onMounted(loadPublicRecipe);
}

whenever(
  () => recipe.value,
  () => {
    if (recipe.value && recipe.value.name) {
      title.value = recipe.value.name;
    }
  },
);
</script>
