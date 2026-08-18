"""Fork: Send-to-AnyList schemas. The bridge itself (kevdliu's anylist server) is deployed
separately and LAN-internal; these shapes are the Mealie-side contract only."""

from pydantic import Field

from mealie.schema._mealie import MealieModel


class AnyListLists(MealieModel):
    lists: list[str]


class AnyListSendRequest(MealieModel):
    items: list[str] = Field(min_length=1)
    list_name: str = Field(alias="list", min_length=1)


class AnyListItemResult(MealieModel):
    item: str
    ok: bool
    error: str | None = None


class AnyListSendResult(MealieModel):
    results: list[AnyListItemResult]
    sent: int
    failed: int
