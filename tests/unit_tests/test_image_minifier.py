from pathlib import Path

import pytest
from PIL import Image

from mealie.pkgs.img.minify import PillowMinifier


def make_source(path: Path, width: int, height: int) -> Path:
    """A noisy gradient, so webp can't compress it to nothing and byte comparisons mean something."""
    img = Image.new("RGB", (width, height))
    px = img.load()
    for x in range(width):
        for y in range(height):
            px[x, y] = ((x * 7) % 256, (y * 13) % 256, (x * y) % 256)
    dest = path / "original.jpg"
    img.save(dest, "JPEG", quality=90)
    return dest


@pytest.mark.parametrize(
    ("width", "height"),
    [
        # The pathological case: a phone-sourced image, smaller than the old tiny target. The old
        # code UPSCALED it into a 600x600 square, making "tiny" larger than "min" and the
        # original in every measured recipe.
        (300, 400),
        # A big source, where every rung should genuinely downscale.
        (1080, 1920),
    ],
)
def test_rendition_ladder_is_monotonic_and_never_upscales(tmp_path, width, height):
    source = make_source(tmp_path, width, height)
    PillowMinifier(purge=False).minify(source, force=True)

    renditions = {}
    for name in ("original", "min-original", "tiny-original"):
        file = tmp_path / f"{name}.webp"
        assert file.exists(), f"{name} missing"
        with Image.open(file) as img:
            renditions[name] = {"w": img.width, "h": img.height, "bytes": file.stat().st_size}

    original, mini, tiny = renditions["original"], renditions["min-original"], renditions["tiny-original"]

    # Never upscale: no rendition exceeds the source in either dimension.
    for name, r in renditions.items():
        assert r["w"] <= width and r["h"] <= height, f"{name} upscaled to {r['w']}x{r['h']} from {width}x{height}"

    # Monotonic ladder: tiny < min <= original, in pixels and in bytes. "tiny is bigger than
    # min" was a loaded landmine for any caller believing tiny is the cheap one.
    assert tiny["w"] <= mini["w"] and tiny["h"] <= mini["h"]
    assert mini["w"] <= original["w"] and mini["h"] <= original["h"]
    assert tiny["bytes"] < mini["bytes"], f"tiny ({tiny['bytes']}B) not smaller than min ({mini['bytes']}B)"
    assert mini["bytes"] <= original["bytes"]


def test_min_is_a_real_downscale_for_grid_tiles(tmp_path):
    """min targets 600px longest edge (a ~300px grid tile at 2x DPR); 1024 was a no-op for
    phone-sourced images and shipped full-size files into the grid."""
    source = make_source(tmp_path, 1080, 1920)
    PillowMinifier(purge=False).minify(source, force=True)

    with Image.open(tmp_path / "min-original.webp") as img:
        assert max(img.width, img.height) <= 600


def test_tiny_source_is_left_alone(tmp_path):
    """A source smaller than every target passes through untouched — an upscaled thumbnail is
    strictly worse than the original in both bytes and quality."""
    source = make_source(tmp_path, 150, 150)
    PillowMinifier(purge=False).minify(source, force=True)

    with Image.open(tmp_path / "tiny-original.webp") as img:
        assert (img.width, img.height) == (150, 150)
