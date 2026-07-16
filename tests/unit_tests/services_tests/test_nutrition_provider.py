from unittest.mock import patch

import pytest

from mealie.schema.group.ai_providers import AIProviderOut, AIProviderSettingsOut, AIProviderSettingsUpdate
from mealie.schema.openai.general import OpenAIText
from mealie.schema.recipe.recipe import Recipe
from mealie.schema.recipe.recipe_ingredient import RecipeIngredient
from mealie.services.openai import OpenAIService
from mealie.services.recipe.nutrition_estimate_service import NutritionEstimateService

DEFAULT = AIProviderOut(id="11111111-1111-4111-8111-111111111111", name="flash-lite", model="gemini-3.1-flash-lite")
NUTRITION = AIProviderOut(id="22222222-2222-4222-8222-222222222222", name="flash", model="gemini-3.5-flash")
DELETED_ID = "33333333-3333-4333-8333-333333333333"


class FakeProviderRepo:
    def get_one(self, provider_id):
        return {str(DEFAULT.id): DEFAULT, str(NUTRITION.id): NUTRITION}.get(str(provider_id))


class FakeSettingsRepo:
    def __init__(self, settings):
        self._settings = settings

    def get_one(self, _group_id):
        return self._settings


class FakeRepos:
    group_id = "g"

    def __init__(self, nutrition_provider_id=None):
        self.group_ai_providers = FakeProviderRepo()
        self.group_ai_provider_settings = FakeSettingsRepo(
            AIProviderSettingsOut(
                default_provider_id=DEFAULT.id,
                audio_provider_id=None,
                image_provider_id=None,
                nutrition_provider_id=nutrition_provider_id,
                providers=[
                    {"id": DEFAULT.id, "name": DEFAULT.name},
                    {"id": NUTRITION.id, "name": NUTRITION.name},
                ],
            )
        )


@pytest.fixture()
def record_provider():
    """Capture which provider each call actually resolved to, at the layer that decides."""
    calls: list[str] = []

    async def _record(_self, _prompt, _content, schema, provider):
        calls.append(provider.model)

        content = (
            '{"text":"some recipe"}'
            if schema.__name__ == "OpenAIText"
            else '{"calories":450,"protein_content":20,"carbohydrate_content":30,"fat_content":10}'
        )

        class Response:
            class Choice:
                class Message:
                    pass

                message = Message()

            choices = [Choice()]

        Response.choices[0].message.content = content
        return Response()

    with (
        patch("mealie.services.openai.openai.OpenAIService._get_raw_response", _record),
        patch("mealie.services.openai.openai.OpenAIService.get_prompt", lambda *_a, **_k: "stub prompt"),
    ):
        yield calls


def a_recipe() -> Recipe:
    return Recipe(
        name="Test",
        recipe_servings=4,
        recipe_ingredient=[RecipeIngredient(note="1 kg beef chuck"), RecipeIngredient(note="2 tbsp paprika")],
    )


@pytest.mark.asyncio
async def test_estimate_falls_back_to_default_when_slot_unset(record_provider):
    """
    THE REGRESSION THAT MATTERS: every existing install has no nutrition provider.

    An empty slot must mean "use the default", never "disabled". Copying the audio pattern of
    refusing to run is what makes transcription silently never fire.
    """
    await NutritionEstimateService(FakeRepos()).estimate(a_recipe())
    assert record_provider == ["gemini-3.1-flash-lite"]


@pytest.mark.asyncio
async def test_estimate_uses_nutrition_provider_when_set(record_provider):
    await NutritionEstimateService(FakeRepos(nutrition_provider_id=NUTRITION.id)).estimate(a_recipe())
    assert record_provider == ["gemini-3.5-flash"]


@pytest.mark.asyncio
async def test_scraping_still_uses_the_default_when_nutrition_slot_is_set(record_provider):
    """
    The other half, and the one a naive change breaks silently.

    "Just use the nutrition provider" would pass the test above while moving every import onto a
    20-req/day quota — imports are constant, estimates are occasional. Scraping must not follow
    this slot.
    """
    service = OpenAIService(FakeRepos(nutrition_provider_id=NUTRITION.id))
    await service.get_response("p", "some recipe text", response_schema=OpenAIText)
    assert record_provider == ["gemini-3.1-flash-lite"]


def test_service_loads_the_slot():
    assert OpenAIService(FakeRepos()).nutrition_provider is None

    service = OpenAIService(FakeRepos(nutrition_provider_id=NUTRITION.id))
    assert service.nutrition_provider is not None
    assert service.nutrition_provider.model == "gemini-3.5-flash"
    # Setting nutrition must not disturb the provider everything else uses.
    assert service.default_provider.model == "gemini-3.1-flash-lite"


def _settings_out(**kwargs) -> AIProviderSettingsOut:
    return AIProviderSettingsOut(
        default_provider_id=DEFAULT.id,
        audio_provider_id=None,
        image_provider_id=None,
        providers=[{"id": DEFAULT.id, "name": DEFAULT.name}, {"id": NUTRITION.id, "name": NUTRITION.name}],
        **kwargs,
    )


def test_nutrition_provider_enabled_reports_the_slot_not_the_feature():
    """False here means "no separate model", NOT "estimates are off" — they fall back."""
    unset = _settings_out()
    assert unset.nutrition_provider_enabled is False
    assert unset.ai_enabled is True

    assert _settings_out(nutrition_provider_id=NUTRITION.id).nutrition_provider_enabled is True


def test_stale_provider_id_is_scrubbed():
    """A deleted provider must not linger in the slot, exactly as for the other three."""
    assert _settings_out(nutrition_provider_id=DELETED_ID).nutrition_provider_id is None


def test_update_payload_from_a_client_that_predates_the_field():
    """
    Backward compatibility, asserted rather than assumed.

    The update is a full model_dump replace, so this field is defaulted where the other three are
    required: an older caller PUTs the old shape and gets "use the default" rather than a 422.
    """
    old_shape = AIProviderSettingsUpdate(default_provider_id=DEFAULT.id, audio_provider_id=None, image_provider_id=None)
    assert old_shape.nutrition_provider_id is None
    assert "nutrition_provider_id" in old_shape.model_dump()
