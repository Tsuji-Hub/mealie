"""Fork: Send-to-AnyList — a thin authenticated proxy in front of the LAN AnyList bridge.

The browser never talks to the bridge directly (no CORS exposure, no LAN URL in frontend
code); this controller is the only path. The bridge (kevdliu's anylist server, run as a
standalone container) holds the AnyList credentials in its OWN env — they never enter this
codebase, its config, or its logs.

The unofficial AnyList protocol can break whenever AnyList changes something, so errors are
deliberately loud and attributable: "bridge unreachable" (502, the container/LAN is the
problem) is a different message from "AnyList rejected" (per-item failure, the protocol or
account is the problem). A future breakage should be a five-minute diagnosis.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Any

import requests
from fastapi import APIRouter, HTTPException, status

from mealie.core.config import get_app_settings
from mealie.core.exceptions import NoEntryFound
from mealie.routes._base.base_controllers import BaseUserController
from mealie.routes._base.controller import controller
from mealie.schema.household.anylist import (
    AnyListItemResult,
    AnyListItemStatus,
    AnyListLists,
    AnyListRecipeTag,
    AnyListSendRequest,
    AnyListSendResult,
)
from mealie.schema.response import ErrorResponse
from mealie.services import urls
from mealie.services.recipe.recipe_service import RecipeService

router = APIRouter(prefix="/households/anylist", tags=["Households: AnyList"])

# The bridge is LAN-local: connects fail fast, reads stay short, a down bridge must produce
# a clean 502 quickly rather than a hung request.
CONNECT_TIMEOUT = 3
READ_TIMEOUT = 8
SEND_CONCURRENCY = 4


def _bridge_url() -> str | None:
    """Module-level accessor so tests can point the feature at a fake bridge."""
    return get_app_settings().ANYLIST_BRIDGE_URL


def _pinned_list() -> str | None:
    """The one allowed target list, when the install pins one (see ANYLIST_LIST)."""
    return get_app_settings().ANYLIST_LIST


# The single place the two note lines are joined. If the AnyList app collapses the newline,
# this becomes " · " and nothing else changes.
NOTE_SEPARATOR = "\n"


def _public_base_url() -> str | None:
    """BASE_URL, or None when it is still the default. The default is http://localhost:8080,
    which on Mom's phone is a dead link, so it counts as unset: the note is then the recipe
    name alone. Never a relative path, never request.host, never a LAN address."""
    settings = get_app_settings()
    return None if settings.is_default_base_url else settings.BASE_URL


def recipe_note(name: str, recipe_url: str | None) -> str:
    """The item note (the gray line under the item in the AnyList app): exactly the recipe
    name, then its public URL. No prefix words, no trailing punctuation."""
    return f"{name}{NOTE_SEPARATOR}{recipe_url}" if recipe_url else name


def existing_notes(item: dict[str, Any]) -> str:
    """The note already on a listed item. Bridge 1.7.3's GET /items returns it as `notes`
    (live keys: checked, id, name, notes). `details` is AnyList's own name for the field and
    is kept as a fallback, so a bridge that renames it cannot silently turn every merge back
    into an overwrite (the bug this replaced: reading only `details` always saw "")."""
    return item.get("notes") or item.get("details") or ""


def _require_bridge() -> str:
    url = _bridge_url()
    if not url:
        # Unset = feature disabled. 404 (not 503) so the frontend's availability probe can
        # distinguish "this install has no bridge" from "the bridge is down right now".
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse.respond(message="AnyList integration is not configured."),
        )
    return url.rstrip("/")


@controller(router)
class AnyListController(BaseUserController):
    @router.get("/lists", response_model=AnyListLists)
    def get_lists(self):
        url = _require_bridge()

        # Pinned install: the bridge account owns the user's ENTIRE AnyList (private lists
        # included), and this is a shared-household app. Answer from config without asking
        # the bridge, so the other list names never reach any browser.
        pinned = _pinned_list()
        if pinned:
            return AnyListLists(lists=[pinned])

        try:
            response = requests.get(f"{url}/lists", timeout=(CONNECT_TIMEOUT, READ_TIMEOUT))
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as e:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail=ErrorResponse.respond(message="AnyList bridge unreachable."),
            ) from e

        # The bridge returns {"lists": [...]}; normalize both plain names and {name} objects
        # so a bridge version bump in either direction cannot blank the picker.
        raw = payload.get("lists", []) if isinstance(payload, dict) else payload
        names = [item if isinstance(item, str) else (item or {}).get("name", "") for item in raw]
        return AnyListLists(lists=[name for name in names if name])

    @router.post("/send", response_model=AnyListSendResult)
    def send(self, data: AnyListSendRequest):
        url = _require_bridge()

        # Pinned install: refuse any other target — a stale last-used list remembered by
        # some device's localStorage must not leak items onto it. Attributable error, third
        # member of the taxonomy: not-configured (404) / unreachable (502) / not allowed (400).
        pinned = _pinned_list()
        if pinned and data.list_name != pinned:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.respond(
                    message=f'AnyList list not allowed; this install sends only to "{pinned}".'
                ),
            )

        # Resolve the recipe inside the caller's group, same scope as the recipe routes. The
        # note's name and URL are built from THIS record, never from client-supplied text.
        try:
            recipe = RecipeService(self.repos, self.user, self.household, translator=self.translator).get_one(
                data.recipe.slug
            )
        except NoEntryFound as e:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse.respond(message="AnyList send: recipe not found."),
            ) from e

        base = _public_base_url()
        recipe_url = urls.recipe_url(self.group.slug, recipe.slug, base) if base else None
        note = recipe_note(recipe.name or recipe.slug, recipe_url)
        # What proves "this recipe is already tagged on the item": the URL when there is one.
        marker = recipe_url or note

        # A 304 from /add means an item with that exact name is already on the list. Fetch
        # the list's items at most ONCE per send, however many items come back 304.
        items_lock = Lock()
        items_cache: dict[str, list[dict[str, Any]]] = {}

        def list_items() -> list[dict[str, Any]]:
            with items_lock:
                if "items" not in items_cache:
                    response = requests.get(
                        f"{url}/items",
                        params={"list": data.list_name},
                        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                    )
                    response.raise_for_status()
                    payload = response.json()
                    raw = payload.get("items", []) if isinstance(payload, dict) else payload
                    items_cache["items"] = [i for i in raw if isinstance(i, dict)]
                return items_cache["items"]

        def merge_existing(item: str) -> AnyListItemResult:
            existing = next((i for i in list_items() if i.get("name") == item), None)
            if existing is None or not existing.get("id"):
                return AnyListItemResult(
                    item=item, status=AnyListItemStatus.failed, error="AnyList rejected (304, item not found)"
                )

            current = existing_notes(existing)
            already_tagged = marker in current
            # Every sent item ends up unchecked: a re-send means Mom needs to buy it again.
            if already_tagged and not existing.get("checked"):
                return AnyListItemResult(item=item, status=AnyListItemStatus.merged)

            new_notes = current if already_tagged else (f"{current}{NOTE_SEPARATOR}{note}" if current else note)
            response = requests.post(
                f"{url}/update",
                json={"id": existing["id"], "list": data.list_name, "notes": new_notes, "checked": False},
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
            )
            if response.status_code >= 400:
                return AnyListItemResult(
                    item=item, status=AnyListItemStatus.failed, error=f"AnyList rejected ({response.status_code})"
                )
            return AnyListItemResult(item=item, status=AnyListItemStatus.merged)

        def add_item(item: str) -> AnyListItemResult:
            try:
                response = requests.post(
                    f"{url}/add",
                    json={"name": item, "list": data.list_name, "notes": note},
                    timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                )
                if response.status_code == 304:
                    return merge_existing(item)
            except requests.RequestException:
                return AnyListItemResult(item=item, status=AnyListItemStatus.failed, error="bridge unreachable")
            if response.status_code >= 300:
                return AnyListItemResult(
                    item=item, status=AnyListItemStatus.failed, error=f"AnyList rejected ({response.status_code})"
                )
            return AnyListItemResult(item=item, status=AnyListItemStatus.added)

        # Server-side loop with small concurrency: the browser sends ONE request per send,
        # the fan-out happens here on the LAN. Order of results mirrors the request.
        with ThreadPoolExecutor(max_workers=SEND_CONCURRENCY) as pool:
            results = list(pool.map(add_item, data.items))

        # Nothing reached the bridge at all -> that's a bridge outage, not a partial failure.
        if results and all(r.error == "bridge unreachable" for r in results):
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail=ErrorResponse.respond(message="AnyList bridge unreachable."),
            )

        added = sum(1 for r in results if r.status == AnyListItemStatus.added)
        merged = sum(1 for r in results if r.status == AnyListItemStatus.merged)
        return AnyListSendResult(
            recipe=AnyListRecipeTag(name=recipe.name or recipe.slug, url=recipe_url),
            results=results,
            sent=added + merged,
            merged=merged,
            failed=len(results) - added - merged,
        )
