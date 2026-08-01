"""The two live hotfixes, ported: /photo/ posts reach yt-dlp in the /video/ form, and a
transcript with no recipe in it declines instead of saving a titled, contentless recipe."""

from unittest.mock import MagicMock, patch

import pytest

from mealie.services.scraper.scraper_strategies import RecipeScraperOpenAITranscription
from mealie.schema.recipe.recipe import Recipe, RecipeStep
from mealie.schema.recipe.recipe_ingredient import RecipeIngredient

PHOTO_URL = "https://www.tiktok.com/@chloepoulton.co/photo/7664708192911265037"
VIDEO_URL = "https://www.tiktok.com/@chloepoulton.co/video/7664708192911265037"
SHORT_URL = "https://www.tiktok.com/t/ZP8topVk5/"


def build(url: str) -> RecipeScraperOpenAITranscription:
    scraper = RecipeScraperOpenAITranscription.__new__(RecipeScraperOpenAITranscription)
    scraper.url = url
    scraper.logger = MagicMock()
    return scraper


class TestYtdlpUrl:
    def test_photo_post_swapped_to_video_form_keeping_the_handle(self):
        # The whole fix: yt-dlp says "Unsupported URL" for /photo/, downloads /video/ fine.
        assert build(PHOTO_URL)._ytdlp_url() == VIDEO_URL

    def test_video_post_unchanged(self):
        assert build(VIDEO_URL)._ytdlp_url() == VIDEO_URL

    def test_non_tiktok_untouched_and_never_resolved(self):
        url = "https://www.allrecipes.com/recipe/223042/chicken-parmesan/"
        with patch("urllib.request.urlopen") as urlopen:
            assert build(url)._ytdlp_url() == url
            urlopen.assert_not_called()

    def test_short_link_resolved_then_swapped(self):
        # Ethan's failing import: t/ZP8topVk5/ resolves to the /photo/ form of chloepoulton's
        # slideshow; the swap must then apply to the RESOLVED url.
        resolved = MagicMock()
        resolved.url = PHOTO_URL
        resolved.__enter__ = lambda self_: resolved
        resolved.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=resolved):
            assert build(SHORT_URL)._ytdlp_url() == VIDEO_URL

    def test_short_link_resolution_failure_falls_back_to_raw_url(self):
        # Today's behavior on failure — a warning and the original URL, never an exception.
        with patch("urllib.request.urlopen", side_effect=OSError("boom")):
            assert build(SHORT_URL)._ytdlp_url() == SHORT_URL


class TestEmptyRecipeGuard:
    @staticmethod
    def recipe(ingredients: int, steps: int) -> Recipe:
        return Recipe(
            name="obsessed is an understatement",
            recipe_ingredient=[RecipeIngredient(note=f"item {i}") for i in range(ingredients)],
            recipe_instructions=[RecipeStep(title="", text=f"step {i}") for i in range(steps)],
        )

    def test_no_ingredients_and_no_steps_is_empty(self):
        # The backing-song case: the model returns a Recipe named after the caption with empty
        # lists, and before the guard it was logged as a SUCCESS and saved.
        assert RecipeScraperOpenAITranscription._is_empty_recipe(self.recipe(0, 0)) is True

    @pytest.mark.parametrize(("ingredients", "steps"), [(5, 2), (5, 0), (0, 2)])
    def test_any_content_is_kept(self, ingredients: int, steps: int):
        # Partial recipes still return — the guard only rejects title-and-nothing-else.
        assert RecipeScraperOpenAITranscription._is_empty_recipe(self.recipe(ingredients, steps)) is False
