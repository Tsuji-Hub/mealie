"""
The OIDC routes answer cleanly when OIDC isn't configured (they used to 500 with a NameError).
"""

import pytest
from fastapi.responses import RedirectResponse
from fastapi.testclient import TestClient

from mealie.core.config import get_app_settings
from mealie.routes.auth import auth as auth_module
from tests.utils import api_routes


@pytest.fixture
def oidc_off(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(auth_module, "oauth", None)


@pytest.mark.parametrize("route", [api_routes.auth_oauth, api_routes.auth_oauth_callback])
def test_oidc_routes_404_when_not_configured(api_client: TestClient, oidc_off, route: str):
    response = api_client.get(route, follow_redirects=False)

    assert response.status_code == 404
    assert response.json()["detail"] == "OIDC not configured"


def test_test_environment_has_oidc_off():
    # The module-level client is only built when OIDC is configured; the guard relies on that.
    if not get_app_settings().OIDC_READY:
        assert auth_module.oauth is None


def test_oidc_login_still_redirects_when_configured(api_client: TestClient, monkeypatch: pytest.MonkeyPatch):
    class FakeClient:
        async def authorize_redirect(self, request, redirect_uri):
            return RedirectResponse(f"https://idp.example/authorize?redirect_uri={redirect_uri}")

    class FakeOAuth:
        def create_client(self, name):
            assert name == "oidc"
            return FakeClient()

    monkeypatch.setattr(auth_module, "oauth", FakeOAuth())
    response = api_client.get(api_routes.auth_oauth, follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"].startswith("https://idp.example/authorize")
