"""
A TLS verification failure reaches the user as one clear message on every create-by-URL route.
"""

import pytest
from fastapi.testclient import TestClient

import mealie.services.scraper.recipe_scraper as recipe_scraper_module
from mealie.pkgs.safehttp import CertificateVerificationError
from mealie.services.scraper import scraper_strategies
from mealie.services.scraper.scraper import TLS_VERIFICATION_FAILED_MESSAGE
from tests.utils import api_routes
from tests.utils.fixture_schemas import TestUser
from tests.utils.helpers import parse_sse_events

MESSAGE = "This site's security certificate couldn't be verified, so the recipe wasn't imported."


@pytest.fixture
def bad_certificate(monkeypatch: pytest.MonkeyPatch):
    async def raise_tls(url: str) -> str:
        raise CertificateVerificationError("expired.badssl.com", "curl: (60) SSL certificate problem: expired")

    monkeypatch.setattr(recipe_scraper_module, "safe_scrape_html", raise_tls)
    monkeypatch.setattr(scraper_strategies, "safe_scrape_html", raise_tls)


def test_message_is_the_agreed_text():
    assert TLS_VERIFICATION_FAILED_MESSAGE == MESSAGE


def test_create_by_url_returns_the_message(api_client: TestClient, unique_user: TestUser, bad_certificate):
    response = api_client.post(
        api_routes.recipes_create_url, json={"url": "https://expired.badssl.com/"}, headers=unique_user.token
    )

    assert response.status_code == 400
    assert response.json()["detail"]["message"] == MESSAGE
    assert response.json()["detail"]["exception"] == "TLS_VERIFICATION_FAILED"


def test_create_by_url_stream_emits_the_code(api_client: TestClient, unique_user: TestUser, bad_certificate):
    response = api_client.post(
        api_routes.recipes_create_url_stream, json={"url": "https://expired.badssl.com/"}, headers=unique_user.token
    )

    assert response.status_code == 200
    errors = [e for e in parse_sse_events(response.text) if e["event"] == "error"]
    # The frontend maps this code to the same sentence (en-US "new-recipe.tls-verification-failed").
    assert errors == [{"event": "error", "data": {"message": "TLS_VERIFICATION_FAILED"}}]


def test_other_stream_errors_are_unchanged(
    api_client: TestClient, unique_user: TestUser, monkeypatch: pytest.MonkeyPatch
):
    async def raise_other(*args, **kwargs):
        raise ValueError("boom")

    monkeypatch.setattr("mealie.routes.recipe.recipe_crud_routes.create_from_html", raise_other)
    response = api_client.post(
        api_routes.recipes_create_url_stream, json={"url": "https://example.com/r"}, headers=unique_user.token
    )

    errors = [e for e in parse_sse_events(response.text) if e["event"] == "error"]
    assert errors == [{"event": "error", "data": {"message": "ValueError"}}]


def test_test_scrape_url_returns_the_message(api_client: TestClient, unique_user: TestUser, bad_certificate):
    response = api_client.post(
        api_routes.recipes_test_scrape_url, json={"url": "https://expired.badssl.com/"}, headers=unique_user.token
    )

    assert response.status_code == 400
    assert response.json()["detail"]["message"] == MESSAGE
