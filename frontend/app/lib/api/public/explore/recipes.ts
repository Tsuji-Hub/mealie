import { BaseCRUDAPIReadOnly } from "~/lib/api/base/base-clients";
import { route } from "../../base";
import { Recipe, RecipeSuggestionQuery, RecipeSuggestionResponse } from "~/lib/api/types/recipe";
import { ApiRequestInstance, PaginationData, RecipeFacets } from "~/lib/api/types/non-generated";
import { RecipeSearchQuery } from "../../user/recipes/recipe";

const prefix = "/api";
const exploreGroupSlug = (groupSlug: string | number) => `${prefix}/explore/groups/${groupSlug}`

const routes = {
  recipesGroupSlug: (groupSlug: string | number) => `${exploreGroupSlug(groupSlug)}/recipes`,
  recipesGroupSlugRecipeSlug: (groupSlug: string | number, recipeSlug: string | number) => `${exploreGroupSlug(groupSlug)}/recipes/${recipeSlug}`,
};

export class PublicRecipeApi extends BaseCRUDAPIReadOnly<Recipe> {
  constructor(requests: ApiRequestInstance, private readonly groupSlug: string) {
    super(
      requests,
      routes.recipesGroupSlug(groupSlug),
      (itemId: string | number) => routes.recipesGroupSlugRecipeSlug(groupSlug, itemId)
    );
  }

  async search(rsq: RecipeSearchQuery) {
    return await this.requests.get<PaginationData<Recipe>>(route(routes.recipesGroupSlug(this.groupSlug), rsq));
  }

  async getSuggestions(q: RecipeSuggestionQuery, foods: string[] | null = null, tools: string[]| null = null) {
    return await this.requests.get<RecipeSuggestionResponse>(
      route(`${routes.recipesGroupSlug(this.groupSlug)}/suggestions`, { ...q, foods, tools })
    );
  }

  /** Organisers present in the recipe set these filters select, with counts. Same params as
   * the list route, constrained server-side by the public-visibility filter. */
  async getFacets(rsq: RecipeSearchQuery) {
    return await this.requests.get<RecipeFacets>(route(`${routes.recipesGroupSlug(this.groupSlug)}/facets`, rsq));
  }
}
