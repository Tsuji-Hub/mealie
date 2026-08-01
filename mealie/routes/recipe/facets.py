from uuid import UUID

from fastapi import Depends, HTTPException, Query
from pydantic import UUID4

from mealie.routes._base import controller
from mealie.routes._base.routers import UserAPIRouter
from mealie.schema.cookbook.cookbook import ReadCookBook
from mealie.schema.make_dependable import make_dependable
from mealie.schema.recipe.recipe_facets import RecipeFacets
from mealie.schema.response.pagination import RecipeSearchQuery

from ._base import BaseRecipeController

router = UserAPIRouter(prefix="/recipes")


def resolve_cookbook_match_attr(cookbook: str | UUID) -> str:
    """Slug-or-id resolution, same rule the recipe list route uses."""
    if isinstance(cookbook, UUID):
        return "id"
    try:
        UUID(cookbook)
        return "id"
    except ValueError:
        return "slug"


@controller(router)
class RecipeFacetsController(BaseRecipeController):
    @router.get("/facets", response_model=RecipeFacets)
    def get_facets(
        self,
        search_query: RecipeSearchQuery = Depends(make_dependable(RecipeSearchQuery)),
        categories: list[UUID4 | str] | None = Query(None),
        tags: list[UUID4 | str] | None = Query(None),
        tools: list[UUID4 | str] | None = Query(None),
        foods: list[UUID4 | str] | None = Query(None),
        households: list[UUID4 | str] | None = Query(None),
    ) -> RecipeFacets:
        """
        The organisers present in the recipe set these filters select, with counts.

        Accepts the same query parameters as the recipe list route, so the frontend passes its
        existing filter state through unchanged and the facets always describe exactly the list
        the user is looking at.
        """
        cookbook_data: ReadCookBook | None = None
        if search_query.cookbook:
            cookbook_data = self.group_cookbooks.get_one(
                search_query.cookbook, resolve_cookbook_match_attr(search_query.cookbook)
            )
            if cookbook_data is None:
                raise HTTPException(status_code=404, detail="cookbook not found")

        # Degrade, don't 500 — the count_by_cookbooks posture. A filter list that is too long
        # (the frontend falls back to the full organiser stores on ok=False) beats a search
        # page that will not load.
        try:
            return self.group_recipes.by_user(self.user.id).facet_counts(
                cookbook=cookbook_data,
                categories=categories,
                tags=tags,
                tools=tools,
                foods=foods,
                households=households,
                require_all_categories=search_query.require_all_categories,
                require_all_tags=search_query.require_all_tags,
                require_all_tools=search_query.require_all_tools,
                require_all_foods=search_query.require_all_foods,
                search=search_query.search,
            )
        except Exception:
            self.logger.exception("Facet computation failed; returning ok=False so the client falls back")
            return RecipeFacets(ok=False)
