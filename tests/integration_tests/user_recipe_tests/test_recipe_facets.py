from fastapi.testclient import TestClient

from mealie.schema.cookbook.cookbook import SaveCookBook
from mealie.schema.recipe.recipe import Recipe
from mealie.schema.recipe.recipe_category import TagSave
from tests.utils import api_routes
from tests.utils.factories import random_string
from tests.utils.fixture_schemas import TestUser

FACETS_ROUTE = f"{api_routes.recipes}/facets"


def _make_tagged_recipes(user: TestUser, tag_name: str, count: int):
    tag = user.repos.tags.create(TagSave(name=tag_name, group_id=user.group_id))
    user.repos.recipes.create_many(
        [
            Recipe(
                user_id=user.user_id,
                group_id=user.group_id,
                name=random_string(),
                tags=[tag],
            )
            for _ in range(count)
        ]
    )
    return tag


def test_facets_count_organisers_in_scope(api_client: TestClient, unique_user: TestUser):
    """Unfiltered facets contain every tag with its true recipe count."""
    dinner_tag = _make_tagged_recipes(unique_user, f"dinner-{random_string()}", 3)
    dessert_tag = _make_tagged_recipes(unique_user, f"dessert-{random_string()}", 2)

    response = api_client.get(FACETS_ROUTE, headers=unique_user.token)
    assert response.status_code == 200
    facets = response.json()
    assert facets["ok"] is True

    counts = {tag["id"]: tag["count"] for tag in facets["tags"]}
    assert counts[str(dinner_tag.id)] == 3
    assert counts[str(dessert_tag.id)] == 2


def test_facets_exclude_organisers_outside_the_filtered_set(api_client: TestClient, unique_user: TestUser):
    """
    THE ACCEPTANCE CASE: inside a cookbook scoped to dinner recipes, dessert-only tags must not
    be offered at all — an option should only be offered if choosing it would return something.
    """
    dinner_tag = _make_tagged_recipes(unique_user, f"dinner-{random_string()}", 3)
    dessert_tag = _make_tagged_recipes(unique_user, f"dessert-{random_string()}", 2)

    # A real cookbook is a saved FILTER STRING, not a join table — build it the way the live
    # instance does. (SaveCookBook has no `tags` field; passing one is silently dropped by
    # pydantic and yields an unscoped cookbook, which is a fixture lying to the test.)
    cookbook = unique_user.repos.cookbooks.create(
        SaveCookBook(
            name=random_string(),
            group_id=unique_user.group_id,
            household_id=unique_user.household_id,
            query_filter_string=f'tags.id IN ["{dinner_tag.id}"]',
        )
    )

    response = api_client.get(FACETS_ROUTE, params={"cookbook": cookbook.slug}, headers=unique_user.token)
    assert response.status_code == 200
    facets = response.json()
    assert facets["ok"] is True

    tag_ids = {tag["id"] for tag in facets["tags"]}
    assert str(dinner_tag.id) in tag_ids
    assert str(dessert_tag.id) not in tag_ids, "dessert-only tag offered inside a dinner-scoped cookbook"

    counts = {tag["id"]: tag["count"] for tag in facets["tags"]}
    assert counts[str(dinner_tag.id)] == 3


def test_facets_respect_tag_filters(api_client: TestClient, unique_user: TestUser):
    """Filtering by a tag narrows the facet universe to the recipes that carry it."""
    dinner_tag = _make_tagged_recipes(unique_user, f"dinner-{random_string()}", 3)
    dessert_tag = _make_tagged_recipes(unique_user, f"dessert-{random_string()}", 2)

    response = api_client.get(
        FACETS_ROUTE,
        params={"tags": [str(dinner_tag.id)], "requireAllTags": True},
        headers=unique_user.token,
    )
    assert response.status_code == 200
    facets = response.json()

    tag_ids = {tag["id"] for tag in facets["tags"]}
    assert str(dinner_tag.id) in tag_ids
    assert str(dessert_tag.id) not in tag_ids


def test_facets_unknown_cookbook_404s(api_client: TestClient, unique_user: TestUser):
    response = api_client.get(FACETS_ROUTE, params={"cookbook": "does-not-exist"}, headers=unique_user.token)
    assert response.status_code == 404
