"""
AsyncSafeTransport verifies TLS against real handshakes on local servers (tests/utils/tls_servers.py).
"""

import asyncio
import logging
import socket

import httpx
import pytest

from mealie.pkgs import safehttp
from mealie.pkgs.safehttp import transport as transport_module
from tests.utils.tls_servers import PAGE, TLSServers, tls_servers

LOG_NAME = "test-safehttp-tls"


@pytest.fixture(scope="module")
def servers():
    yield from tls_servers()


@pytest.fixture
def public_dns(monkeypatch: pytest.MonkeyPatch):
    """Let the SSRF guard pass for localhost; curl still connects to the local server."""
    real = socket.gethostbyname
    monkeypatch.setattr(
        transport_module.socket, "gethostbyname", lambda host: "93.184.216.34" if host == "localhost" else real(host)
    )


def fetch(url: str, **transport_kwargs) -> httpx.Response:
    async def go():
        transport = safehttp.AsyncSafeTransport(log=logging.getLogger(LOG_NAME), **transport_kwargs)
        async with httpx.AsyncClient(transport=transport) as client:
            response = await client.get(url, follow_redirects=True)
            await response.aread()
            return response

    return asyncio.run(go())


def test_default_verify_is_the_certifi_bundle():
    import certifi

    transport = safehttp.AsyncSafeTransport()
    assert transport._session.verify == certifi.where()


def test_trusted_chain_is_accepted(servers: TLSServers, public_dns):
    # Verification ON, with a bundle that trusts the test CA: the handshake must succeed.
    response = fetch(servers.url("valid"), verify=str(servers.ca_file))
    assert response.status_code == 200
    assert response.content == PAGE


@pytest.mark.parametrize("impersonate", [None, "chrome"])
@pytest.mark.parametrize(
    ("server", "use_test_ca", "expected_detail"),
    [
        ("expired", True, "certificate has expired"),
        ("selfsigned", True, "self signed certificate"),
        ("wronghost", True, "no alternative certificate subject name matches"),
        # The default (certifi) bundle does not know the test CA: an untrusted root.
        ("valid", False, "unable to get local issuer certificate"),
    ],
)
def test_bad_certificates_raise_and_never_reach_the_server(
    servers: TLSServers,
    public_dns,
    caplog: pytest.LogCaptureFixture,
    server: str,
    use_test_ca: bool,
    expected_detail: str,
    impersonate: str | None,
):
    kwargs: dict = {"impersonate": impersonate} if impersonate else {}
    if use_test_ca:
        kwargs["verify"] = str(servers.ca_file)
    hits_before = servers.hits[server]

    with caplog.at_level(logging.WARNING, logger=LOG_NAME):
        with pytest.raises(safehttp.CertificateVerificationError) as exc_info:
            fetch(servers.url(server), **kwargs)

    assert exc_info.value.host == "localhost"
    assert expected_detail in exc_info.value.detail
    assert servers.hits[server] == hits_before, "request body/handler reached despite a failed verification"
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING and r.name == LOG_NAME]
    assert any("verification failed for localhost" in r.getMessage() for r in warnings)


@pytest.mark.parametrize("listed", ["localhost", "LocalHost"])
def test_listed_host_skips_verification_with_a_warning(
    servers: TLSServers, public_dns, caplog: pytest.LogCaptureFixture, listed: str
):
    with caplog.at_level(logging.WARNING, logger=LOG_NAME):
        response = fetch(servers.url("selfsigned"), insecure_hosts=[listed], impersonate="chrome")

    assert response.status_code == 200
    assert response.content == PAGE
    assert any(
        r.levelno == logging.WARNING and "verification skipped for localhost" in r.getMessage() for r in caplog.records
    )


def test_unlisted_host_is_still_verified_when_others_are_listed(servers: TLSServers, public_dns):
    with pytest.raises(safehttp.CertificateVerificationError):
        fetch(servers.url("selfsigned"), insecure_hosts=["example.com"])


def test_plain_http_is_unchanged(servers: TLSServers, public_dns, caplog: pytest.LogCaptureFixture):
    with caplog.at_level(logging.WARNING, logger=LOG_NAME):
        response = fetch(servers.url("http"), insecure_hosts=["localhost"])

    assert response.status_code == 200
    assert response.content == PAGE
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING and r.name == LOG_NAME]


def test_non_tls_failures_keep_their_error_type(public_dns):
    # Nothing listens on this port: a plain connection error, not a certificate error.
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    with pytest.raises(httpx.ConnectError):
        fetch(f"https://localhost:{port}/")


@pytest.mark.parametrize(
    ("url", "listed", "skips"),
    [
        ("https://insecure.example/", ["insecure.example"], True),
        ("https://INSECURE.example/page", ["insecure.example"], True),
        ("https://other.example/", ["insecure.example"], False),
        ("https://sub.insecure.example/", ["insecure.example"], False),  # exact match only
        ("http://insecure.example/", ["insecure.example"], False),
        ("https://insecure.example/", [], False),
    ],
)
def test_skip_decision_is_per_request_host(url: str, listed: list[str], skips: bool):
    # Decided per request, so each redirect hop is judged on its own host.
    transport = safehttp.AsyncSafeTransport(insecure_hosts=listed)
    request = httpx.Request("GET", url, extensions={"timeout": httpx.Timeout(5).as_dict()})
    params = transport._create_request_params(request)
    assert (params.get("verify") is False) is skips
