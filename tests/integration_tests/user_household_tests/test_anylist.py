"""Fork: Send-to-AnyList proxy routes, exercised against a faked bridge.

The real bridge is a separate LAN container and never runs in tests; every case here
monkeypatches the controller's requests usage. What matters: disabled installs 404 (the
frontend's availability probe), a down bridge is a clean 502 (never a hang, never a 500),
partial failures come back per-item so the UI can offer retry, and every item carries a
server-built recipe note (name + public URL) that merges onto items already on the list."""

import pytest
import requests
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from mealie.routes.households import controller_anylist
from tests.utils import assert_deserialize
from tests.utils.factories import random_string
from tests.utils.fixture_schemas import TestUser

LISTS_ROUTE = "/api/households/anylist/lists"
SEND_ROUTE = "/api/households/anylist/send"
BASE = "https://recipes.example.test"


class FakeResponse:
    def __init__(self, status_code: int = 200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")


def enable_bridge(monkeypatch: MonkeyPatch, url: str = "http://fake-bridge:1234"):
    monkeypatch.setattr(controller_anylist, "_bridge_url", lambda: url)


def set_base(monkeypatch: MonkeyPatch, base: str | None = BASE):
    monkeypatch.setattr(controller_anylist, "_public_base_url", lambda: base)


def pin_list(monkeypatch: MonkeyPatch, name: str = "Shared Grocery List"):
    monkeypatch.setattr(controller_anylist, "_pinned_list", lambda: name)


@pytest.fixture
def recipe(api_client: TestClient, unique_user: TestUser) -> dict:
    name = f"Garlic Sauce {random_string(6)}"
    response = api_client.post("/api/recipes", json={"name": name}, headers=unique_user.token)
    assert response.status_code == 201
    group = api_client.get("/api/groups/self", headers=unique_user.token).json()
    return {"name": name, "slug": response.json(), "group_slug": group["slug"]}


def body(recipe: dict, items: list[str], list_name: str = "Groceries") -> dict:
    return {"items": items, "list": list_name, "recipe": {"slug": recipe["slug"]}}


def expected_note(recipe: dict, base: str = BASE) -> str:
    return f"{recipe['name']}\n{base}/g/{recipe['group_slug']}/r/{recipe['slug']}"


# ================================================================================================
# Availability, auth, lists (O + P)


def test_anylist_disabled_is_404(api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch):
    monkeypatch.setattr(controller_anylist, "_bridge_url", lambda: None)
    response = api_client.get(LISTS_ROUTE, headers=unique_user.token)
    assert response.status_code == 404

    response = api_client.post(SEND_ROUTE, json=body(recipe, ["20 g flour"]), headers=unique_user.token)
    assert response.status_code == 404


def test_anylist_routes_require_auth(api_client: TestClient, monkeypatch: MonkeyPatch):
    enable_bridge(monkeypatch)
    assert api_client.get(LISTS_ROUTE).status_code == 401
    assert api_client.post(SEND_ROUTE, json={"items": ["x"], "list": "L", "recipe": {"slug": "x"}}).status_code == 401


def test_anylist_lists_proxies_and_normalizes(api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch):
    enable_bridge(monkeypatch)
    # Both shapes the bridge has shipped: plain names and {name} objects.
    monkeypatch.setattr(
        controller_anylist.requests,
        "get",
        lambda *a, **k: FakeResponse(payload={"lists": ["Groceries", {"name": "Costco"}, ""]}),
    )

    response = api_client.get(LISTS_ROUTE, headers=unique_user.token)
    data = assert_deserialize(response, 200)
    assert data["lists"] == ["Groceries", "Costco"]


def test_anylist_lists_bridge_down_is_502(api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch):
    enable_bridge(monkeypatch)

    def boom(*args, **kwargs):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(controller_anylist.requests, "get", boom)
    response = api_client.get(LISTS_ROUTE, headers=unique_user.token)
    assert response.status_code == 502
    assert "unreachable" in response.json()["detail"]["message"].lower()


def test_anylist_pinned_lists_answer_without_touching_the_bridge(
    api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    pin_list(monkeypatch)

    def forbidden(*args, **kwargs):
        raise AssertionError("pinned /lists must never call the bridge")

    monkeypatch.setattr(controller_anylist.requests, "get", forbidden)

    response = api_client.get(LISTS_ROUTE, headers=unique_user.token)
    data = assert_deserialize(response, 200)
    # Exactly the pinned name — the account's other list names never reach a browser.
    assert data["lists"] == ["Shared Grocery List"]


# ================================================================================================
# Send: validation and error taxonomy


def test_anylist_send_requires_recipe_slug(api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch):
    enable_bridge(monkeypatch)
    response = api_client.post(SEND_ROUTE, json={"items": ["2 eggs"], "list": "Groceries"}, headers=unique_user.token)
    assert response.status_code == 422


def test_anylist_send_unknown_recipe_is_404(api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch):
    enable_bridge(monkeypatch)

    def forbidden(*args, **kwargs):
        raise AssertionError("an unknown recipe must never reach the bridge")

    monkeypatch.setattr(controller_anylist.requests, "post", forbidden)
    response = api_client.post(
        SEND_ROUTE,
        json={"items": ["2 eggs"], "list": "Groceries", "recipe": {"slug": "no-such-recipe-" + random_string(8)}},
        headers=unique_user.token,
    )
    assert response.status_code == 404
    assert "recipe not found" in response.json()["detail"]["message"].lower()


def test_anylist_send_rejects_empty_items(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    response = api_client.post(SEND_ROUTE, json=body(recipe, []), headers=unique_user.token)
    assert response.status_code == 422


def test_anylist_send_bridge_down_is_502(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)

    def boom(*args, **kwargs):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(controller_anylist.requests, "post", boom)
    response = api_client.post(SEND_ROUTE, json=body(recipe, ["a", "b"]), headers=unique_user.token)
    assert response.status_code == 502


def test_anylist_pinned_send_rejects_other_lists_before_the_bridge(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    pin_list(monkeypatch)

    def forbidden(*args, **kwargs):
        raise AssertionError("a rejected send must never reach the bridge")

    monkeypatch.setattr(controller_anylist.requests, "post", forbidden)

    # The stale-localStorage case: some device still remembers a pre-pin list name.
    response = api_client.post(SEND_ROUTE, json=body(recipe, ["2 eggs"], "Backyard BBQ"), headers=unique_user.token)
    assert response.status_code == 400
    assert "not allowed" in response.json()["detail"]["message"].lower()


# ================================================================================================
# Send: added path and the recipe note


def test_anylist_send_added_carries_the_two_line_note(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    set_base(monkeypatch)
    seen: list[dict] = []

    def fake_post(url, json=None, **kwargs):
        seen.append(json)
        # Second item is rejected by "AnyList" — must come back per-item, not as a 500.
        return FakeResponse(status_code=500 if json["name"] == "bad item" else 200)

    monkeypatch.setattr(controller_anylist.requests, "post", fake_post)

    response = api_client.post(
        SEND_ROUTE, json=body(recipe, ["20 g flour", "bad item", "2 eggs"]), headers=unique_user.token
    )
    data = assert_deserialize(response, 200)

    assert data["sent"] == 2 and data["failed"] == 1 and data["merged"] == 0
    by_item = {r["item"]: r for r in data["results"]}
    assert by_item["20 g flour"]["status"] == "added"
    assert by_item["bad item"]["status"] == "failed"
    assert "rejected" in by_item["bad item"]["error"].lower()

    note = expected_note(recipe)
    # Byte for byte: name, one newline, public URL. No prefix words, no trailing punctuation.
    assert all(payload["notes"] == note for payload in seen)
    assert all(payload["list"] == "Groceries" for payload in seen)
    assert {payload["name"] for payload in seen} == {"20 g flour", "bad item", "2 eggs"}
    assert data["recipe"] == {"name": recipe["name"], "url": note.split("\n")[1]}


def test_anylist_send_default_base_url_sends_name_only(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    set_base(monkeypatch, None)  # BASE_URL unset (still the localhost default)
    seen: list[dict] = []

    def fake_post(url, json=None, **kwargs):
        seen.append(json)
        return FakeResponse()

    monkeypatch.setattr(controller_anylist.requests, "post", fake_post)

    response = api_client.post(SEND_ROUTE, json=body(recipe, ["2 eggs"]), headers=unique_user.token)
    data = assert_deserialize(response, 200)
    assert seen[0]["notes"] == recipe["name"]
    assert data["recipe"] == {"name": recipe["name"], "url": None}


def test_anylist_default_base_url_counts_as_unset():
    # The real accessor, not a patch: the stock localhost default is a dead link on a phone.
    settings = controller_anylist.get_app_settings()
    if settings.is_default_base_url:
        assert controller_anylist._public_base_url() is None
    else:
        assert controller_anylist._public_base_url() == settings.BASE_URL


# ================================================================================================
# Send: 304 merge path


class FakeBridge:
    """Stateful fake: /add 304s names already on the list, /items and /update act on them.

    Items use the LIVE bridge 1.7.3 shape (keys: checked, id, name, notes). The first version
    of this fake used `details`, which is why the overwrite bug shipped green (PROMPT Q.1)."""

    def __init__(self, items: list[dict]):
        self.items = {i["name"]: dict(i) for i in items}
        self.get_items_calls = 0
        self.updates: list[dict] = []

    def post(self, url, json=None, **kwargs):
        if url.endswith("/add"):
            if json["name"] in self.items:
                return FakeResponse(status_code=304)
            self.items[json["name"]] = {
                "id": f"id-{len(self.items)}",
                "name": json["name"],
                "notes": json.get("notes", ""),
                "checked": False,
            }
            return FakeResponse()
        if url.endswith("/update"):
            self.updates.append(json)
            item = next(i for i in self.items.values() if i["id"] == json["id"])
            item["notes"] = json["notes"]
            item["checked"] = json["checked"]
            return FakeResponse()
        return FakeResponse(status_code=404)

    def get(self, url, params=None, **kwargs):
        assert url.endswith("/items")
        self.get_items_calls += 1
        return FakeResponse(payload=list(self.items.values()))


def install(monkeypatch: MonkeyPatch, bridge: FakeBridge):
    monkeypatch.setattr(controller_anylist.requests, "post", bridge.post)
    monkeypatch.setattr(controller_anylist.requests, "get", bridge.get)


def test_anylist_304_merges_notes_with_one_items_fetch(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    set_base(monkeypatch)
    other_note = "Chicken Tikka\nhttps://recipes.example.test/g/home/r/chicken-tikka"
    bridge = FakeBridge(
        [
            {"id": "a", "name": "2 eggs", "notes": other_note, "checked": True},
            {"id": "b", "name": "20 g flour", "notes": "", "checked": False},
            {"id": "c", "name": "1 lemon", "notes": other_note, "checked": False},
        ]
    )
    install(monkeypatch, bridge)

    response = api_client.post(
        SEND_ROUTE, json=body(recipe, ["2 eggs", "20 g flour", "1 lemon", "fresh basil"]), headers=unique_user.token
    )
    data = assert_deserialize(response, 200)

    statuses = {r["item"]: r["status"] for r in data["results"]}
    assert statuses == {"2 eggs": "merged", "20 g flour": "merged", "1 lemon": "merged", "fresh basil": "added"}
    assert data["sent"] == 4 and data["merged"] == 3 and data["failed"] == 0

    # Three 304s, ONE items fetch.
    assert bridge.get_items_calls == 1
    note = expected_note(recipe)
    assert bridge.items["2 eggs"]["notes"] == f"{other_note}\n{note}"
    assert bridge.items["20 g flour"]["notes"] == note  # empty notes: no leading newline
    # Every sent item ends up unchecked.
    assert all(update["checked"] is False for update in bridge.updates)
    assert bridge.items["2 eggs"]["checked"] is False


def test_anylist_resend_is_idempotent(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    set_base(monkeypatch)
    bridge = FakeBridge([])
    install(monkeypatch, bridge)

    for _ in range(2):
        response = api_client.post(SEND_ROUTE, json=body(recipe, ["2 eggs"]), headers=unique_user.token)
        assert response.status_code == 200

    # Second send: 304 -> already tagged and unchecked -> nothing to update, URL not duplicated.
    assert bridge.items["2 eggs"]["notes"].count(expected_note(recipe).split("\n")[1]) == 1
    assert bridge.updates == []
    assert response.json()["results"][0]["status"] == "merged"


def test_anylist_resend_after_check_off_unchecks_without_duplicating(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    set_base(monkeypatch)
    note = expected_note(recipe)
    bridge = FakeBridge([{"id": "a", "name": "2 eggs", "notes": note, "checked": True}])
    install(monkeypatch, bridge)

    response = api_client.post(SEND_ROUTE, json=body(recipe, ["2 eggs"]), headers=unique_user.token)
    assert assert_deserialize(response, 200)["results"][0]["status"] == "merged"

    assert bridge.updates == [{"id": "a", "list": "Groceries", "notes": note, "checked": False}]
    assert bridge.items["2 eggs"]["notes"] == note


def test_anylist_304_but_item_missing_fails_attributably(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    monkeypatch.setattr(controller_anylist.requests, "post", lambda *a, **k: FakeResponse(status_code=304))
    monkeypatch.setattr(controller_anylist.requests, "get", lambda *a, **k: FakeResponse(payload={"items": []}))

    response = api_client.post(SEND_ROUTE, json=body(recipe, ["2 eggs"]), headers=unique_user.token)
    result = assert_deserialize(response, 200)["results"][0]
    assert result["status"] == "failed"
    assert "rejected" in result["error"].lower()


def test_anylist_second_recipe_appends_not_replaces(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    # The live acceptance failure: send recipe A, then recipe B with a shared line. The shared
    # item must carry BOTH notes, in order, not just B's.
    enable_bridge(monkeypatch)
    set_base(monkeypatch)
    bridge = FakeBridge([])
    install(monkeypatch, bridge)

    name_b = f"Garlic Naan Pizzas {random_string(6)}"
    slug_b = api_client.post("/api/recipes", json={"name": name_b}, headers=unique_user.token).json()
    recipe_b = {"name": name_b, "slug": slug_b, "group_slug": recipe["group_slug"]}

    api_client.post(SEND_ROUTE, json=body(recipe, ["2 cloves garlic"]), headers=unique_user.token)
    response = api_client.post(SEND_ROUTE, json=body(recipe_b, ["2 cloves garlic"]), headers=unique_user.token)

    assert response.json()["results"][0]["status"] == "merged"
    assert len(bridge.items) == 1
    assert bridge.items["2 cloves garlic"]["notes"] == f"{expected_note(recipe)}\n{expected_note(recipe_b)}"


def test_anylist_merge_falls_back_to_details_key(
    api_client: TestClient, unique_user: TestUser, recipe: dict, monkeypatch: MonkeyPatch
):
    # A bridge that reports the note as `details` (AnyList's own field name) must still merge.
    enable_bridge(monkeypatch)
    set_base(monkeypatch)
    other_note = "Chicken Tikka\nhttps://recipes.example.test/g/home/r/chicken-tikka"
    updates: list[dict] = []

    def fake_post(url, json=None, **kwargs):
        if url.endswith("/add"):
            return FakeResponse(status_code=304)
        updates.append(json)
        return FakeResponse()

    monkeypatch.setattr(controller_anylist.requests, "post", fake_post)
    monkeypatch.setattr(
        controller_anylist.requests,
        "get",
        lambda *a, **k: FakeResponse(payload=[{"id": "a", "name": "2 eggs", "details": other_note, "checked": False}]),
    )

    response = api_client.post(SEND_ROUTE, json=body(recipe, ["2 eggs"]), headers=unique_user.token)
    assert response.json()["results"][0]["status"] == "merged"
    assert updates[0]["notes"] == f"{other_note}\n{expected_note(recipe)}"


def test_existing_notes_prefers_notes_then_details():
    assert controller_anylist.existing_notes({"notes": "a", "details": "b"}) == "a"
    assert controller_anylist.existing_notes({"details": "b"}) == "b"
    assert controller_anylist.existing_notes({"notes": None}) == ""
