from pydantic import UUID4, Field

from mealie.schema._mealie import MealieModel


class FacetItem(MealieModel):
    id: UUID4
    name: str
    slug: str
    count: int


class RecipeFacets(MealieModel):
    """The organisers actually present in a filtered recipe set, with counts.

    Exists because the filter selectors used to offer every organiser in the group
    unconditionally — the Dinner cookbook offered dessert-only tags that matched zero recipes in
    scope. An option should only be offered if choosing it would return something.
    """

    tags: list[FacetItem] = []
    categories: list[FacetItem] = []
    tools: list[FacetItem] = []

    ok: bool = Field(
        True,
        description=(
            "False when facet computation failed and the caller should fall back to the full "
            "organiser lists. Distinct from empty lists, which legitimately mean the filtered "
            "set contains no organisers at all."
        ),
    )
