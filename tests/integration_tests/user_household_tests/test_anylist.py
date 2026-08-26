"""Fork: Send-to-AnyList proxy routes, exercised against a faked bridge.

The real bridge is a separate LAN container and never runs in tests; every case here
monkeypatches the controller's requests usage. What matters: disabled installs 404 (the
frontend's availability probe), a down bridge is a clean 502 (never a hang, never a 500),
and partial failures come back per-item so the UI can offer retry."""

import requests
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from mealie.routes.households import controller_anylist
from tests.utils import assert_deserialize
from tests.utils.fixture_schemas import TestUser

LISTS_ROUTE = "/api/households/anylist/lists"
SEND_ROUTE = "/api/households/anylist/send"


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


def test_anylist_disabled_is_404(api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch):
    monkeypatch.setattr(controller_anylist, "_bridge_url", lambda: None)
    response = api_client.get(LISTS_ROUTE, headers=unique_user.token)
    assert response.status_code == 404

    response = api_client.post(
        SEND_ROUTE, json={"items": ["20 g flour"], "list": "Groceries"}, headers=unique_user.token
    )
    assert response.status_code == 404


def test_anylist_routes_require_auth(api_client: TestClient, monkeypatch: MonkeyPatch):
    enable_bridge(monkeypatch)
    assert api_client.get(LISTS_ROUTE).status_code == 401
    assert api_client.post(SEND_ROUTE, json={"items": ["x"], "list": "L"}).status_code == 401


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


def test_anylist_send_success_and_partial_failure(
    api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    seen: list[dict] = []

    def fake_post(url, json=None, **kwargs):
        seen.append(json)
        # Second item is rejected by "AnyList" — must come back per-item, not as a 500.
        status = 500 if json["name"] == "bad item" else 200
        return FakeResponse(status_code=status)

    monkeypatch.setattr(controller_anylist.requests, "post", fake_post)

    body = {"items": ["20 g flour", "bad item", "2 eggs"], "list": "Groceries"}
    response = api_client.post(SEND_ROUTE, json=body, headers=unique_user.token)
    data = assert_deserialize(response, 200)

    assert data["sent"] == 2
    assert data["failed"] == 1
    by_item = {r["item"]: r for r in data["results"]}
    assert by_item["20 g flour"]["ok"] is True
    assert by_item["bad item"]["ok"] is False
    assert "rejected" in by_item["bad item"]["error"].lower()
    # Every forwarded item carried the target list verbatim.
    assert all(payload["list"] == "Groceries" for payload in seen)
    assert {payload["name"] for payload in seen} == {"20 g flour", "bad item", "2 eggs"}


def test_anylist_send_bridge_down_is_502(api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch):
    enable_bridge(monkeypatch)

    def boom(*args, **kwargs):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(controller_anylist.requests, "post", boom)
    response = api_client.post(SEND_ROUTE, json={"items": ["a", "b"], "list": "Groceries"}, headers=unique_user.token)
    assert response.status_code == 502


def test_anylist_send_rejects_empty_items(api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch):
    enable_bridge(monkeypatch)
    response = api_client.post(SEND_ROUTE, json={"items": [], "list": "Groceries"}, headers=unique_user.token)
    assert response.status_code == 422


def pin_list(monkeypatch: MonkeyPatch, name: str = "Shared Grocery List"):
    monkeypatch.setattr(controller_anylist, "_pinned_list", lambda: name)


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


def test_anylist_pinned_send_rejects_other_lists_before_the_bridge(
    api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    pin_list(monkeypatch)

    def forbidden(*args, **kwargs):
        raise AssertionError("a rejected send must never reach the bridge")

    monkeypatch.setattr(controller_anylist.requests, "post", forbidden)

    # The stale-localStorage case: some device still remembers a pre-pin list name.
    response = api_client.post(
        SEND_ROUTE, json={"items": ["2 eggs"], "list": "Backyard BBQ"}, headers=unique_user.token
    )
    assert response.status_code == 400
    assert "not allowed" in response.json()["detail"]["message"].lower()


def test_anylist_pinned_send_accepts_the_pinned_name(
    api_client: TestClient, unique_user: TestUser, monkeypatch: MonkeyPatch
):
    enable_bridge(monkeypatch)
    pin_list(monkeypatch)
    seen: list[dict] = []

    def fake_post(url, json=None, **kwargs):
        seen.append(json)
        return FakeResponse()

    monkeypatch.setattr(controller_anylist.requests, "post", fake_post)

    body = {"items": ["20 g flour", "2 eggs"], "list": "Shared Grocery List"}
    response = api_client.post(SEND_ROUTE, json=body, headers=unique_user.token)
    data = assert_deserialize(response, 200)
    assert data["sent"] == 2
    assert all(payload["list"] == "Shared Grocery List" for payload in seen)
