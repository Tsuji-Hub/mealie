"""
Local HTTPS servers with deliberately good and bad certificates, so TLS verification is tested
against real handshakes (curl's own verifier) without touching the network.

Every server listens on 127.0.0.1 and is addressed as https://localhost:<port>. AsyncSafeTransport's
SSRF guard refuses private addresses, so tests that go through it patch the guard's DNS lookup to
a public address (`public_dns` fixture); curl still resolves localhost itself.
"""

import datetime
import ssl
import tempfile
import threading
from collections.abc import Generator
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

PAGE = b"<html><head><title>tls test page</title></head><body>ok</body></html>"
IMAGE = b"\xff\xd8\xff\xe0 not really a jpeg"


@dataclass
class TLSServers:
    ca_file: Path
    """Bundle containing only the test CA; pass as `verify=` to trust `valid` and nothing else."""
    ports: dict[str, int]
    """valid | expired | wronghost | selfsigned, plus `http` (plain HTTP)."""
    hits: dict[str, int]
    """Requests that reached each server's HTTP handler, i.e. got past TLS."""

    def url(self, name: str, path: str = "/") -> str:
        scheme = "http" if name == "http" else "https"
        return f"{scheme}://localhost:{self.ports[name]}{path}"


def _key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


def _name(cn: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def _cert(subject_cn, san, key, issuer_name, issuer_key, not_before, not_after, ca=False) -> x509.Certificate:
    builder = (
        x509.CertificateBuilder()
        .subject_name(_name(subject_cn))
        .issuer_name(issuer_name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before)
        .not_valid_after(not_after)
    )
    if ca:
        builder = builder.add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
    else:
        builder = builder.add_extension(x509.SubjectAlternativeName([x509.DNSName(san)]), critical=False)
    return builder.sign(issuer_key, hashes.SHA256())


def _handler(name: str, hits: dict[str, int]):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _respond(self, body: bool):
            hits[name] += 1
            if self.path.startswith("/redirect-to/"):
                self.send_response(302)
                self.send_header("Location", self.path.removeprefix("/redirect-to/"))
                self.send_header("Content-Length", "0")
                self.send_header("Connection", "close")
                self.end_headers()
                return
            payload, ctype = (IMAGE, "image/jpeg") if self.path.endswith(".jpg") else (PAGE, "text/html")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Connection", "close")
            self.end_headers()
            if body:
                self.wfile.write(payload)

        def do_GET(self):
            self._respond(body=True)

        def do_HEAD(self):
            self._respond(body=False)

        def log_message(self, *args):
            pass

    return Handler


def tls_servers() -> Generator[TLSServers, None, None]:
    now = datetime.datetime.now(datetime.UTC)
    day = datetime.timedelta(days=1)
    workdir = Path(tempfile.mkdtemp(prefix="mealie-tls-"))

    ca_key = _key()
    ca = _cert("Mealie Test CA", None, ca_key, _name("Mealie Test CA"), ca_key, now - day, now + 30 * day, ca=True)
    ca_file = workdir / "ca.pem"
    ca_file.write_bytes(ca.public_bytes(serialization.Encoding.PEM))

    leaf_keys = {name: _key() for name in ("valid", "expired", "wronghost", "selfsigned")}
    certs = {
        "valid": _cert("localhost", "localhost", leaf_keys["valid"], ca.subject, ca_key, now - day, now + 10 * day),
        "expired": _cert("localhost", "localhost", leaf_keys["expired"], ca.subject, ca_key, now - 10 * day, now - day),
        "wronghost": _cert(
            "other.test", "other.test", leaf_keys["wronghost"], ca.subject, ca_key, now - day, now + 10 * day
        ),
        "selfsigned": _cert(
            "localhost",
            "localhost",
            leaf_keys["selfsigned"],
            _name("localhost"),
            leaf_keys["selfsigned"],
            now - day,
            now + 10 * day,
        ),
    }

    hits = dict.fromkeys([*certs, "http"], 0)
    ports: dict[str, int] = {}
    servers: list[ThreadingHTTPServer] = []

    for name, cert in certs.items():
        cert_file, key_file = workdir / f"{name}.crt", workdir / f"{name}.key"
        cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        key_file.write_bytes(
            leaf_keys[name].private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
            )
        )
        server = ThreadingHTTPServer(("127.0.0.1", 0), _handler(name, hits))
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert_file, key_file)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        servers.append(server)
        ports[name] = server.server_address[1]

    plain = ThreadingHTTPServer(("127.0.0.1", 0), _handler("http", hits))
    servers.append(plain)
    ports["http"] = plain.server_address[1]

    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()

    try:
        yield TLSServers(ca_file=ca_file, ports=ports, hits=hits)
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()
