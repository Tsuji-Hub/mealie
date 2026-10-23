"""
The scraper and the image download verify TLS; SCRAPER_TLS_INSECURE_HOSTS is the only way out.
Real handshakes against local servers (tests/utils/tls_servers.py).
"""

import asyncio
import logging
import socket
from uuid import uuid4

import pydantic
import pytest

from mealie.core.config import get_app_settings
from mealie.pkgs import safehttp
from mealie.pkgs.safehttp import transport as transport_module
from mealie.services.recipe.recipe_data_service import RecipeDataService, largest_content_len
from mealie.services.scraper import scraper_strategies
from mealie.services.scraper.scraper_strategies import safe_scrape_html
from tests.utils.tls_servers import PAGE, TLSServers, tls_servers


@pytest.fixture(scope="module")
def servers():
    yield from tls_servers()


@pytest.fixture
def public_dns(monkeypatch: pytest.MonkeyPatch):
    real = socket.gethostbyname
    monkeypatch.setattr(
        transport_module.socket, "gethostbyname", lambda host: "93.184.216.34" if host == "localhost" else real(host)
    )


@pytest.fixture
def insecure_hosts(monkeypatch: pytest.MonkeyPatch):
    """Set SCRAPER_TLS_INSECURE_HOSTS on the live settings object for one test."""

    def set_hosts(value: str):
        monkeypatch.setattr(get_app_settings(), "SCRAPER_TLS_INSECURE_HOSTS", value)

    set_hosts("")
    return set_hosts


def count_requests(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    seen: list[str] = []
    real = safehttp.AsyncSafeTransport.handle_async_request

    async def counting(self, request):
        seen.append(str(request.url))
        return await real(self, request)

    monkeypatch.setattr(safehttp.AsyncSafeTransport, "handle_async_request", counting)
    return seen


# ----------------------------------------------------------------------------------------------
# Page fetch (safe_scrape_html), which cycles browser impersonations starting with chrome


@pytest.mark.parametrize("server", ["expired", "selfsigned", "wronghost", "valid"])
def test_page_fetch_fails_on_unverifiable_certificates(
    servers: TLSServers, public_dns, insecure_hosts, monkeypatch: pytest.MonkeyPatch, server: str
):
    # "valid" is signed by the test CA, which the certifi bundle doesn't trust (untrusted root).
    seen = count_requests(monkeypatch)
    with pytest.raises(safehttp.CertificateVerificationError):
        asyncio.run(safe_scrape_html(servers.url(server)))

    # One attempt, no retry under another impersonation and none without verification.
    assert seen == [servers.url(server)]


def test_page_fetch_skips_verification_only_for_a_listed_host(
    servers: TLSServers, public_dns, insecure_hosts, caplog: pytest.LogCaptureFixture
):
    insecure_hosts("LOCALHOST")
    with caplog.at_level(logging.WARNING):
        html = asyncio.run(safe_scrape_html(servers.url("selfsigned")))

    assert html == PAGE.decode()
    assert any("verification skipped for localhost" in r.getMessage() for r in caplog.records)


def test_page_fetch_over_plain_http_is_unchanged(servers: TLSServers, public_dns, insecure_hosts):
    assert asyncio.run(safe_scrape_html(servers.url("http"))) == PAGE.decode()


def test_all_scraper_transports_verify(monkeypatch: pytest.MonkeyPatch, insecure_hosts):
    # Every transport the scraper and the image download build must keep the certifi default.
    import certifi

    created: list[safehttp.AsyncSafeTransport] = []
    real_init = safehttp.AsyncSafeTransport.__init__

    def recording_init(self, *args, **kwargs):
        assert "verify" not in kwargs, f"caller overrides verify: {kwargs}"
        real_init(self, *args, **kwargs)
        created.append(self)

    monkeypatch.setattr(safehttp.AsyncSafeTransport, "__init__", recording_init)
    insecure_hosts("listed.example")

    class Stop(Exception):
        pass

    async def stop(self, request):
        raise Stop

    monkeypatch.setattr(safehttp.AsyncSafeTransport, "handle_async_request", stop)

    scraper = scraper_strategies.RecipeScraperTikTokOEmbed.__new__(scraper_strategies.RecipeScraperTikTokOEmbed)
    scraper.logger = logging.getLogger("test")

    with pytest.raises(Stop):
        asyncio.run(safe_scrape_html("https://page.example/"))
    asyncio.run(scraper._resolve_short_link("https://vm.tiktok.com/ZM1abc/"))  # swallows errors by design
    asyncio.run(scraper._fetch_caption("https://www.tiktok.com/@u/video/123"))  # swallows errors by design
    asyncio.run(largest_content_len(["https://img.example/a.jpg"]))
    asyncio.run(RecipeDataService(uuid4()).scrape_image("https://img.example/a.jpg"))  # returns None on error

    assert len(created) == 5
    for transport in created:
        assert transport._session.verify == certifi.where()
        assert transport._insecure_hosts == frozenset({"listed.example"})


# ----------------------------------------------------------------------------------------------
# Image download


def test_image_download_fails_closed_on_a_bad_certificate(
    servers: TLSServers, public_dns, insecure_hosts, caplog: pytest.LogCaptureFixture, monkeypatch
):
    hits_before = servers.hits["selfsigned"]
    written: list = []
    monkeypatch.setattr(RecipeDataService, "write_image", lambda self, *a, **k: written.append(a))

    with caplog.at_level(logging.WARNING):
        result = asyncio.run(RecipeDataService(uuid4()).scrape_image(servers.url("selfsigned", "/photo.jpg")))

    # Same contract as any other failed image download: no image, recipe import carries on.
    assert result is None
    assert written == []
    assert servers.hits["selfsigned"] == hits_before
    assert any("verification failed for localhost" in r.getMessage() for r in caplog.records)


def test_image_download_honours_a_listed_host(servers: TLSServers, public_dns, insecure_hosts, monkeypatch):
    insecure_hosts("localhost")
    written: list = []
    monkeypatch.setattr(RecipeDataService, "write_image", lambda self, data, ext: written.append((data, ext)))

    asyncio.run(RecipeDataService(uuid4()).scrape_image(servers.url("selfsigned", "/photo.jpg")))

    assert len(written) == 1


# ----------------------------------------------------------------------------------------------
# SCRAPER_TLS_INSECURE_HOSTS parsing


@pytest.fixture
def fresh_settings(monkeypatch: pytest.MonkeyPatch):
    def build(value: str | None):
        if value is None:
            monkeypatch.delenv("SCRAPER_TLS_INSECURE_HOSTS", raising=False)
        else:
            monkeypatch.setenv("SCRAPER_TLS_INSECURE_HOSTS", value)
        get_app_settings.cache_clear()
        return get_app_settings()

    yield build
    monkeypatch.delenv("SCRAPER_TLS_INSECURE_HOSTS", raising=False)
    get_app_settings.cache_clear()


def test_setting_defaults_to_empty(fresh_settings):
    assert fresh_settings(None).scraper_tls_insecure_hosts == frozenset()


def test_setting_normalises_host_names(fresh_settings):
    settings = fresh_settings(" Old-Blog.example , recipes.example.org. ,,old-blog.example")
    assert settings.scraper_tls_insecure_hosts == frozenset({"old-blog.example", "recipes.example.org"})


@pytest.mark.parametrize(
    "value",
    [
        "*.example.com",
        "203.0.113.7",
        "::1",
        "[2001:db8::1]",
        "example.com:8443",
        "https://example.com",
        "example.com/path",
        "bad host.example",
    ],
)
def test_setting_rejects_anything_but_a_plain_host_name(fresh_settings, value: str):
    with pytest.raises(pydantic.ValidationError, match="SCRAPER_TLS_INSECURE_HOSTS"):
        fresh_settings(f"ok.example,{value}")
