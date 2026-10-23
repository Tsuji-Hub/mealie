"""
Real-network TLS checks against badssl.com and a public recipe site, through the API.
Opt-in (MEALIE_NETWORK_TESTS=1) so the default suite stays offline; the hermetic equivalents
live in tests/unit_tests/pkgs/test_safehttp_tls.py.
"""

import logging
import os

import pytest
from fastapi.testclient import TestClient

from mealie.core.config import get_app_settings
from mealie.services.recipe.recipe_data_service import RecipeDataService
from mealie.services.scraper.scraper import TLS_VERIFICATION_FAILED_MESSAGE
from tests.utils import api_routes
from tests.utils.fixture_schemas import TestUser

pytestmark = pytest.mark.skipif(
    os.environ.get("MEALIE_NETWORK_TESTS") != "1", reason="network test, set MEALIE_NETWORK_TESTS=1"
)


def create(api_client: TestClient, user: TestUser, url: str):
    return api_client.post(api_routes.recipes_create_url, json={"url": url}, headers=user.token)


@pytest.mark.parametrize(
    "url",
    [
        "https://expired.badssl.com/",
        "https://self-signed.badssl.com/",
        "https://wrong.host.badssl.com/",
        "https://untrusted-root.badssl.com/",
    ],
)
def test_bad_certificates_are_refused(api_client: TestClient, unique_user: TestUser, url: str):
    response = create(api_client, unique_user, url)
    assert response.status_code == 400
    assert response.json()["detail"]["message"] == TLS_VERIFICATION_FAILED_MESSAGE


def test_listed_host_gets_past_tls(
    api_client: TestClient, unique_user: TestUser, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
):
    monkeypatch.setattr(get_app_settings(), "SCRAPER_TLS_INSECURE_HOSTS", "self-signed.badssl.com")
    with caplog.at_level(logging.WARNING):
        response = create(api_client, unique_user, "https://self-signed.badssl.com/")

    # Past TLS; the page simply has no recipe in it.
    assert response.json()["detail"]["message"] != TLS_VERIFICATION_FAILED_MESSAGE
    assert any("verification skipped for self-signed.badssl.com" in r.getMessage() for r in caplog.records)


def test_valid_https_recipe_imports(api_client: TestClient, unique_user: TestUser, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(RecipeDataService, "scrape_image", lambda *_: "TEST_IMAGE")
    response = create(api_client, unique_user, "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/")
    assert response.status_code == 201, response.text
