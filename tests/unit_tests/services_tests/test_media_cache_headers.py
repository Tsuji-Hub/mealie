from uuid import uuid4

from fastapi.testclient import TestClient

from mealie.app import app
from mealie.schema.recipe import Recipe


def test_recipe_image_sends_immutable_cache_header(tmp_path, monkeypatch):
    """
    Recipe image URLs are version-stamped by the frontend, so long immutable caching is safe —
    and without it every grid revisit revalidates ~65 images through the single worker.
    """
    recipe_id = uuid4()
    image_dir = tmp_path / str(recipe_id) / "images"
    image_dir.mkdir(parents=True)
    (image_dir / "min-original.webp").write_bytes(b"not-really-webp")

    monkeypatch.setattr(Recipe, "directory_from_id", classmethod(lambda _cls, rid: tmp_path / str(rid)))

    client = TestClient(app)
    response = client.get(f"/api/media/recipes/{recipe_id}/images/min-original.webp")

    assert response.status_code == 200
    cache = response.headers.get("cache-control", "")
    assert "public" in cache
    assert "immutable" in cache
    assert "max-age=2592000" in cache
    # Clients that revalidate anyway still can.
    assert response.headers.get("etag")


def test_recipe_asset_keeps_no_long_cache(tmp_path, monkeypatch):
    """Assets are referenced WITHOUT version params — a month-long cache would pin stale files."""
    recipe_id = uuid4()
    asset_dir = tmp_path / str(recipe_id) / "assets"
    asset_dir.mkdir(parents=True)
    (asset_dir / "notes.txt").write_bytes(b"hello")

    monkeypatch.setattr(Recipe, "directory_from_id", classmethod(lambda _cls, rid: tmp_path / str(rid)))

    client = TestClient(app)
    response = client.get(f"/api/media/recipes/{recipe_id}/assets/notes.txt")

    assert response.status_code == 200
    assert "immutable" not in response.headers.get("cache-control", "")
