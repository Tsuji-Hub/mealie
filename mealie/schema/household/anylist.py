"""Fork: Send-to-AnyList schemas. The bridge itself (kevdliu's anylist server) is deployed
separately and LAN-internal; these shapes are the Mealie-side contract only."""

from enum import StrEnum

from pydantic import Field

from mealie.schema._mealie import MealieModel


class AnyListLists(MealieModel):
    lists: list[str]


class AnyListRecipeRef(MealieModel):
    slug: str = Field(min_length=1)


class AnyListSendRequest(MealieModel):
    items: list[str] = Field(min_length=1)
    list_name: str = Field(alias="list", min_length=1)
    # Only the slug crosses the wire: the note's name and URL are resolved and built
    # server-side, never taken from the client.
    recipe: AnyListRecipeRef


class AnyListItemStatus(StrEnum):
    added = "added"
    merged = "merged"
    failed = "failed"


class AnyListItemResult(MealieModel):
    item: str
    status: AnyListItemStatus
    error: str | None = None


class AnyListRecipeTag(MealieModel):
    name: str
    url: str | None = None


class AnyListSendResult(MealieModel):
    recipe: AnyListRecipeTag
    results: list[AnyListItemResult]
    sent: int
    merged: int
    failed: int
