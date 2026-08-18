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

import requests
from fastapi import APIRouter, HTTPException, status

from mealie.core.config import get_app_settings
from mealie.routes._base.base_controllers import BaseUserController
from mealie.routes._base.controller import controller
from mealie.schema.household.anylist import AnyListItemResult, AnyListLists, AnyListSendRequest, AnyListSendResult
from mealie.schema.response import ErrorResponse

router = APIRouter(prefix="/households/anylist", tags=["Households: AnyList"])

# The bridge is LAN-local: connects fail fast, reads stay short, a down bridge must produce
# a clean 502 quickly rather than a hung request.
CONNECT_TIMEOUT = 3
READ_TIMEOUT = 8
SEND_CONCURRENCY = 4


def _bridge_url() -> str | None:
    """Module-level accessor so tests can point the feature at a fake bridge."""
    return get_app_settings().ANYLIST_BRIDGE_URL


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

        def add_item(item: str) -> AnyListItemResult:
            try:
                response = requests.post(
                    f"{url}/add",
                    json={"name": item, "list": data.list_name},
                    timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                )
            except requests.RequestException:
                return AnyListItemResult(item=item, ok=False, error="bridge unreachable")
            if response.status_code >= 400:
                return AnyListItemResult(item=item, ok=False, error=f"AnyList rejected ({response.status_code})")
            return AnyListItemResult(item=item, ok=True)

        # Server-side loop with small concurrency: the browser sends ONE request per send,
        # the fan-out happens here on the LAN. Order of results mirrors the request.
        with ThreadPoolExecutor(max_workers=SEND_CONCURRENCY) as pool:
            results = list(pool.map(add_item, data.items))

        # Nothing reached the bridge at all -> that's a bridge outage, not a partial failure.
        if results and all(not r.ok and r.error == "bridge unreachable" for r in results):
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail=ErrorResponse.respond(message="AnyList bridge unreachable."),
            )

        sent = sum(1 for r in results if r.ok)
        return AnyListSendResult(results=results, sent=sent, failed=len(results) - sent)
