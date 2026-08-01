"""
Turning a TikTok URL into something oEmbed will answer.

TikTok's page HTML is a JS shell — no schema.org, no microdata, nothing to scrape. The caption,
which for these creators IS the recipe, is only reachable through the public oEmbed endpoint (no
auth, no key). This module owns the URL rules; the strategy that uses it lives in
scraper_strategies.py.
"""

import re
from urllib.parse import urlparse

TIKTOK_HOST_SUFFIX = "tiktok.com"
OEMBED_ENDPOINT = "https://www.tiktok.com/oembed"

#: The numeric id in a /video/, /photo/ or /v/ path. Everything else about the URL — handle,
#: query string, region subdomain — is noise as far as oEmbed is concerned.
_POST_ID = re.compile(r"/(?:video|photo|v)/(\d+)")

#: Short links (vm.tiktok.com/ZM1abc, tiktok.com/t/ZP8sq7p62) carry no id, so the id has to come
#: from following the redirect.
_SHORT_PATH = re.compile(r"^/(?:t/)?[A-Za-z0-9]+/?$")


def is_tiktok_url(url: str) -> bool:
    """Whether this URL is on TikTok. Matches the domain, not a substring: a path or query
    containing 'tiktok.com' on someone else's site is not TikTok."""
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False

    return host == TIKTOK_HOST_SUFFIX or host.endswith(f".{TIKTOK_HOST_SUFFIX}")


def normalize_for_oembed(url: str) -> str | None:
    """
    The URL to hand oEmbed, or None if this isn't a TikTok post.

    Two behaviours here are load-bearing and were verified against the live endpoint rather than
    assumed:

    - **oEmbed 400s on the /photo/ form but answers the /video/ form for the same id.** Short
      links often resolve to /photo/, so without the swap those posts are simply unimportable.
    - **The handle is optional.** oEmbed resolves `/@/video/{id}` and even reports the real
      author back, which matters because ReciMe stored its URLs handle-less (dead in a browser,
      still fine here).

    Rebuilding from the id also drops tracking query params (`?_r=1&_t=...`), which vary per
    share and are noise.
    """
    if not is_tiktok_url(url):
        return None

    path = urlparse(url).path or ""

    match = _POST_ID.search(path)
    if match:
        # Always the /video/ form: it works for videos and is the only form that works for photos.
        return f"https://www.tiktok.com/@/video/{match.group(1)}"

    # A profile, the homepage, /tag/..., /search — TikTok, but not a post. Short links land here
    # too: they carry no id, so they must be resolved first (see is_short_link).
    return None


def to_ytdlp_form(url: str) -> str:
    """
    The URL form yt-dlp can actually read.

    yt-dlp returns "Unsupported URL" for TikTok's /photo/ (slideshow) form, but the /video/ form
    of the SAME post id downloads that post's audio track fine — verified live on
    /photo/7664708192911265037 (Unsupported) vs /video/7664708192911265037 (32s, ~500KB mp3).

    Keeps the handle. The handle-less /@/video/{id} rebuild is verified for oEmbed only; yt-dlp
    has never been tested against it, so this is a swap, not a reconstruction. Non-TikTok URLs
    pass through untouched. Short links must be resolved BEFORE this can see anything — they
    carry no /photo/ or /video/ segment at all.
    """
    if not is_tiktok_url(url):
        return url

    return url.replace("/photo/", "/video/")


def is_short_link(url: str) -> bool:
    """
    Whether this is a TikTok short link, which has to be followed before oEmbed will answer.

    Passing the short link straight to oEmbed does NOT work in general, which is worth being
    explicit about because it looks like it should: oEmbed resolves the link internally, and if it
    lands on a photo post it 400s — the exact failure the /photo/ -> /video/ swap exists to avoid,
    reintroduced one layer down where the swap can't see it. Verified live: `t/ZP8sq7p62` -> 400,
    while resolving it ourselves and swapping the form returns the caption.
    """
    if not is_tiktok_url(url):
        return False

    parsed = urlparse(url)
    if _POST_ID.search(parsed.path or ""):
        return False

    return bool(_SHORT_PATH.match(parsed.path or ""))
