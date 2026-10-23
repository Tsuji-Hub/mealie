import ipaddress
import logging
import socket
from collections.abc import Iterable

import certifi
import httpx
from curl_cffi.const import CurlECode
from httpx_curl_cffi import AsyncCurlTransport

# curl codes that mean "the peer's certificate could not be verified" (bad chain, expired,
# self-signed, hostname mismatch, ...). Handshake/protocol failures (SSL_CONNECT_ERROR) are not
# verification failures and keep surfacing as plain connection errors.
TLS_VERIFICATION_ERRORS = frozenset(
    {
        CurlECode.PEER_FAILED_VERIFICATION,
        CurlECode.OBSOLETE51,  # hostname mismatch on curl < 7.62; newer curl reports it as 60
        CurlECode.SSL_ISSUER_ERROR,
        CurlECode.SSL_PINNEDPUBKEYNOTMATCH,
        CurlECode.SSL_INVALIDCERTSTATUS,
    }
)


class ForcedTimeoutException(Exception):
    """
    Raised when a request takes longer than the timeout value.
    """

    ...


class InvalidDomainError(Exception):
    """
    Raised when a request is made to a local IP address.
    """

    ...


class CertificateVerificationError(Exception):
    """
    Raised when a host's TLS certificate fails verification.
    """

    def __init__(self, host: str, detail: str):
        self.host = host
        self.detail = detail
        super().__init__(f"TLS certificate verification failed for {host}: {detail}")


class AsyncSafeTransport(AsyncCurlTransport):
    """
    A wrapper around the httpx-curl-cffi transport class that enforces a timeout value,
    that the request is not made to a local IP address, and that the peer's TLS certificate
    verifies against the certifi bundle.

    `insecure_hosts` is the only way to skip verification: an exact, case-insensitive host match,
    decided per request so a redirect off a listed host is verified again.
    """

    timeout: int = 15

    def __init__(self, log: logging.Logger | None = None, insecure_hosts: Iterable[str] = (), **kwargs):
        self.timeout = kwargs.pop("timeout", self.timeout)
        self._log = log
        self._insecure_hosts = frozenset(host.lower() for host in insecure_hosts)
        kwargs.setdefault("verify", certifi.where())
        super().__init__(**kwargs)

    def _warn(self, message: str) -> None:
        (self._log or logging.getLogger(__name__)).warning(message)

    def _create_request_params(self, req: httpx.Request) -> dict:
        params = super()._create_request_params(req)
        host = req.url.host.lower()
        if req.url.scheme == "https" and host in self._insecure_hosts:
            self._warn(f"TLS certificate verification skipped for {host} (SCRAPER_TLS_INSECURE_HOSTS): {req.url}")
            params["verify"] = False
        return params

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        # override timeout value for _all_ requests
        request.extensions["timeout"] = httpx.Timeout(self.timeout, pool=self.timeout).as_dict()

        # validate the request is not attempting to connect to a local IP
        # This is a security measure to prevent SSRF attacks

        ip: ipaddress.IPv4Address | ipaddress.IPv6Address | None = None

        netloc = request.url.netloc.decode()
        if ":" in netloc:  # Either an IP, or a hostname:port combo
            netloc_parts = netloc.split(":")

            netloc = netloc_parts[0]

            try:
                ip = ipaddress.ip_address(netloc)
            except ValueError:
                if self._log:
                    self._log.debug(f"failed to parse ip for {netloc=} falling back to domain resolution")
                pass

        # Request is a domain or a hostname.
        if not ip:
            if self._log:
                self._log.debug(f"resolving IP for domain: {netloc}")

            ip_str = socket.gethostbyname(netloc)
            ip = ipaddress.ip_address(ip_str)

            if self._log:
                self._log.debug(f"resolved IP for domain: {netloc} -> {ip}")

        if ip.is_private:
            if self._log:
                self._log.warning(f"invalid request on local resource: {request.url} -> {ip}")
            raise InvalidDomainError(f"invalid request on local resource: {request.url} -> {ip}")

        try:
            return await super().handle_async_request(request)
        except httpx.RequestError as e:
            if getattr(e.__cause__, "code", None) not in TLS_VERIFICATION_ERRORS:
                raise
            host = request.url.host
            self._warn(f"TLS certificate verification failed for {host}: {e}")
            raise CertificateVerificationError(host, str(e)) from e
