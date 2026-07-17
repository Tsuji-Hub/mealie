from enum import StrEnum

from fastapi import APIRouter, HTTPException, status
from pydantic import UUID4
from starlette.responses import FileResponse

from mealie.schema.recipe import Recipe
from mealie.schema.recipe.recipe_timeline_events import RecipeTimelineEventOut

router = APIRouter(prefix="/recipes")

# Recipe image URLs are version-stamped by the frontend (static-routes.ts appends
# ?rnd=&version={recipe.image}), so replacing an image mints a NEW URL — which makes `immutable`
# correct: the browser may skip revalidation entirely. Without this header, every grid revisit
# revalidated every image (~65 conditional GETs through the single uvicorn worker, measured
# straggling at ~1s). ETag/Last-Modified still ride along for clients that revalidate anyway.
#
# Scope: recipe images ONLY, deliberately narrower than it looks like it could be:
# - TIMELINE image URLs carry NO version param (verified in static-routes.ts), and
#   updateTimelineEventImage can replace one under the same URL — immutable would pin the old
#   photo for a month. They keep today's behavior until their URLs are versioned.
# - Recipe assets and user avatars are likewise unversioned; same reasoning.
IMAGE_CACHE_HEADERS = {"Cache-Control": "public, max-age=2592000, immutable, stale-while-revalidate=86400"}


class ImageType(StrEnum):
    original = "original.webp"
    small = "min-original.webp"
    tiny = "tiny-original.webp"


@router.get("/{recipe_id}/images/{file_name}")
async def get_recipe_img(recipe_id: UUID4, file_name: ImageType = ImageType.original):
    """
    Takes in a recipe id, returns the static image. This route is proxied in the docker image
    and should not hit the API in production
    """
    recipe_image = Recipe.directory_from_id(recipe_id).joinpath("images", file_name.value)

    if recipe_image.exists():
        return FileResponse(recipe_image, media_type="image/webp", headers=IMAGE_CACHE_HEADERS)
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND)


@router.get("/{recipe_id}/images/timeline/{timeline_event_id}/{file_name}")
async def get_recipe_timeline_event_img(
    recipe_id: UUID4, timeline_event_id: UUID4, file_name: ImageType = ImageType.original
):
    """
    Takes in a recipe id and event timeline id, returns the static image. This route is proxied in the docker image
    and should not hit the API in production
    """
    timeline_event_image = RecipeTimelineEventOut.image_dir_from_id(recipe_id, timeline_event_id).joinpath(
        file_name.value
    )

    if timeline_event_image.exists():
        # No cache header on purpose: timeline image URLs are not versioned, so a replaced
        # image would be pinned for the full max-age. See IMAGE_CACHE_HEADERS above.
        return FileResponse(timeline_event_image, media_type="image/webp")
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND)


@router.get("/{recipe_id}/assets/{file_name}")
async def get_recipe_asset(recipe_id: UUID4, file_name: str):
    """Returns a recipe asset"""
    asset_dir = Recipe.directory_from_id(recipe_id).joinpath("assets")
    file = asset_dir.joinpath(file_name).resolve()

    if not file.is_relative_to(asset_dir.resolve()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST)

    if file.exists():
        # Force download and disable MIME sniffing so uploaded assets cannot be
        # served as active content in Mealie's origin.
        return FileResponse(
            file,
            filename=file.name,
            content_disposition_type="attachment",
            headers={"X-Content-Type-Options": "nosniff"},
        )
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
