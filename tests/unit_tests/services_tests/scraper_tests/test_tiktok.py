import pytest

from mealie.services.scraper.tiktok import is_short_link, is_tiktok_url, normalize_for_oembed, to_ytdlp_form

GOULASH = "https://www.tiktok.com/@jujumaoo/video/7550296202940632341"
VIDEO_OEMBED = "https://www.tiktok.com/@/video/7550296202940632341"


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.tiktok.com/@jujumaoo/video/7550296202940632341", True),
        ("https://tiktok.com/@user/video/123", True),
        ("https://vm.tiktok.com/ZM1abc/", True),
        ("https://www.tiktok.com/t/ZP8sq7p62", True),
        ("https://TikTok.com/@user/video/123", True),
        # Not TikTok. The last two matter: matching 'tiktok.com' as a substring rather than as a
        # domain would send someone else's page to TikTok's API.
        ("https://www.skinnytaste.com/marry-me-chicken/", False),
        ("https://example.com/tiktok.com/video/123", False),
        ("https://nottiktok.com/@user/video/123", False),
        ("https://evil.com/?ref=tiktok.com", False),
        ("not a url at all", False),
        ("", False),
    ],
)
def test_is_tiktok_url(url: str, expected: bool):
    assert is_tiktok_url(url) is expected


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        # The money case: the Hungarian Goulash video, whose caption is a full recipe.
        (GOULASH, VIDEO_OEMBED),
        # ReciMe stored URLs with no handle. Dead in a browser; oEmbed resolves them anyway.
        ("https://www.tiktok.com/@/video/7550296202940632341", VIDEO_OEMBED),
        # oEmbed 400s on the /photo/ form but answers the /video/ form for the SAME id. Short
        # links often resolve to /photo/, so without this swap those posts can't be imported.
        # Verified live: @emalinelee/photo/7433472127929568558 -> 400, .../video/... -> caption.
        (
            "https://www.tiktok.com/@emalinelee/photo/7433472127929568558",
            "https://www.tiktok.com/@/video/7433472127929568558",
        ),
        # Tracking params vary per share and are noise; rebuilding from the id drops them.
        (
            "https://www.tiktok.com/@emalinelee/photo/7433472127929568558?_r=1&_t=ZP-97I9WyCxhR0",
            "https://www.tiktok.com/@/video/7433472127929568558",
        ),
        (f"{GOULASH}?is_from_webapp=1&sender_device=pc", VIDEO_OEMBED),
        # Legacy /v/ form.
        ("https://www.tiktok.com/v/7550296202940632341", VIDEO_OEMBED),
        # A resolved short link is just a normal post URL by the time it gets here.
        (
            "https://www.tiktok.com/@emalinelee/photo/7433472127929568558?_r=1&_t=ZP-97I9WyCxhR0",
            "https://www.tiktok.com/@/video/7433472127929568558",
        ),
    ],
)
def test_normalize_for_oembed(url: str, expected: str):
    assert normalize_for_oembed(url) == expected


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://vm.tiktok.com/ZM1abc/", True),
        ("https://www.tiktok.com/t/ZP8sq7p62", True),
        ("https://vm.tiktok.com/ZM1abc/?_t=abc&_r=1", True),
        # Already a post URL — the id is right there, nothing to resolve.
        (GOULASH, False),
        ("https://www.tiktok.com/@emalinelee/photo/7433472127929568558", False),
        # Not TikTok: never follow it looking for a caption.
        ("https://www.skinnytaste.com/marry-me-chicken/", False),
    ],
)
def test_is_short_link(url: str, expected: bool):
    """
    Short links must be resolved BEFORE oEmbed sees them.

    Handing oEmbed the short link looks like it should work — oEmbed follows redirects itself —
    but if the link lands on a photo post it 400s, which is exactly the failure the
    /photo/ -> /video/ swap exists to prevent, reintroduced one layer down where the swap can't
    see it. Verified live: t/ZP8sq7p62 -> 400 passed straight through, caption returned when
    resolved first. Two of Ethan's recipes are photo posts behind short links.
    """
    assert is_short_link(url) is expected


@pytest.mark.parametrize(
    "url",
    [
        # TikTok, but not a post — there is no caption to fetch.
        "https://www.tiktok.com/@jujumaoo",
        "https://www.tiktok.com/",
        "https://www.tiktok.com/tag/recipe",
        # Unresolved short links carry no id; is_short_link routes these to the resolver first.
        "https://vm.tiktok.com/ZM1abc/",
        "https://www.tiktok.com/t/ZP8sq7p62",
        # Not TikTok at all: must never be handed to TikTok's API.
        "https://www.skinnytaste.com/marry-me-chicken/",
        "https://example.com/tiktok.com/video/123",
    ],
)
def test_normalize_for_oembed_returns_none(url: str):
    assert normalize_for_oembed(url) is None


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        # THE FIX: yt-dlp answers "Unsupported URL" for /photo/ but downloads the /video/ form of
        # the SAME post (verified live: photo/7664708192911265037 fails, video/... gives 32s mp3).
        # The handle is KEPT — /@/video/ is oEmbed-verified only, never tested against yt-dlp.
        (
            "https://www.tiktok.com/@chloepoulton.co/photo/7664708192911265037",
            "https://www.tiktok.com/@chloepoulton.co/video/7664708192911265037",
        ),
        # Query params survive the swap.
        (
            "https://www.tiktok.com/@chloepoulton.co/photo/7664708192911265037?_r=1&_t=abc",
            "https://www.tiktok.com/@chloepoulton.co/video/7664708192911265037?_r=1&_t=abc",
        ),
        # Already the video form: unchanged.
        (
            "https://www.tiktok.com/@michaeldean2.0/video/7646421170358652173",
            "https://www.tiktok.com/@michaeldean2.0/video/7646421170358652173",
        ),
        # Not TikTok: byte-identical passthrough, even with /photo/ in the path.
        (
            "https://www.allrecipes.com/recipe/223042/chicken-parmesan/",
            "https://www.allrecipes.com/recipe/223042/chicken-parmesan/",
        ),
        ("https://example.com/photo/123", "https://example.com/photo/123"),
        ("", ""),
    ],
)
def test_to_ytdlp_form(url: str, expected: str):
    assert to_ytdlp_form(url) == expected
