import json

from mealie.core import exceptions
from mealie.repos.repository_factory import AllRepositories
from mealie.schema.openai.nutrition import OpenAINutrition
from mealie.schema.recipe.recipe import Recipe
from mealie.schema.recipe.recipe_nutrition import Nutrition
from mealie.schema.recipe.recipe_nutrition_estimate import (
    NUTRITION_ESTIMATED_KEY,
    NUTRITION_ESTIMATED_VALUE,
    NutritionEstimate,
)
from mealie.services.openai import OpenAIDataInjection, OpenAIService

from .._base_service import BaseService

#: The macros we estimate and render. Deliberately the same four the cards and the macro bar
#: show (see use-macro-summary.ts) — "has macros" must mean the same thing on both sides, or
#: the button would offer to estimate a recipe that already looks complete.
ESTIMATED_FIELDS = ("calories", "protein_content", "carbohydrate_content", "fat_content")


def has_macros(nutrition: Nutrition | None) -> bool:
    """Whether a recipe already carries any of the four macros we would estimate."""
    if not nutrition:
        return False

    return any(str(getattr(nutrition, field, None) or "").strip() for field in ESTIMATED_FIELDS)


class NutritionEstimateService(BaseService):
    def __init__(self, repos: AllRepositories) -> None:
        self.repos = repos
        super().__init__()

    def _ingredient_texts(self, recipe: Recipe) -> list[str]:
        """
        The ingredient list as the source wrote it.

        `display` is the robust choice: for a parsed ingredient it is quantity + unit + food +
        note, and for an unparsed one (how the scraper and the TikTok imports store them) the
        whole original string lands in `note`, which display includes. `original_text` is
        frequently null, so it is only a fallback.
        """
        texts: list[str] = []
        for ingredient in recipe.recipe_ingredient or []:
            text = (ingredient.display or "").strip() or (ingredient.original_text or "").strip()
            if text:
                texts.append(text)

        return texts

    @staticmethod
    def servings_for(recipe: Recipe) -> float:
        """
        The divisor for per-serving macros.

        Mirrors the macro bar's `recipeServings || recipeYieldQuantity || 1` exactly. If these
        two ever disagree the bar would label a number the estimate never computed — it would
        say "Macros for 1 cookie, makes 24" over macros divided by something else.
        """
        return recipe.recipe_servings or recipe.recipe_yield_quantity or 1

    def _to_nutrition(self, response: OpenAINutrition) -> Nutrition:
        """
        Map the model's floats onto Mealie's Nutrition, whose fields are strings.

        Only the four estimated fields are set. Everything else is left as None so a save
        merges rather than blanking sodium/fiber/etc. that came from somewhere else.
        """

        def grams(value: float | None) -> str | None:
            return None if value is None else str(round(value, 1))

        return Nutrition(
            calories=None if response.calories is None else str(round(response.calories)),
            protein_content=grams(response.protein_content),
            carbohydrate_content=grams(response.carbohydrate_content),
            fat_content=grams(response.fat_content),
        )

    async def estimate(self, recipe: Recipe) -> NutritionEstimate:
        """Ask the configured AI provider for per-serving macros. Does not write anything."""
        ingredients = self._ingredient_texts(recipe)
        if not ingredients:
            raise exceptions.UnexpectedNone("Recipe has no ingredients to estimate from")

        servings = self.servings_for(recipe)

        service = OpenAIService(self.repos)
        prompt = service.get_prompt(
            "recipes.estimate-nutrition",
            data_injections=[
                OpenAIDataInjection(
                    description=(
                        "This recipe makes the following number of servings. Divide the batch "
                        "total by this number and return the result."
                    ),
                    value=str(servings),
                ),
            ],
        )

        response = await service.get_response(
            prompt,
            json.dumps(ingredients, separators=(",", ":")),
            response_schema=OpenAINutrition,
        )
        if not response:
            raise exceptions.OpenAIServiceError("No response from the AI provider")

        return NutritionEstimate(
            nutrition=self._to_nutrition(response),
            confidence=response.confidence,
            basis=response.basis,
            saved=False,
        )

    @staticmethod
    def build_patch(recipe: Recipe, estimate: NutritionEstimate) -> Recipe:
        """
        Build the partial recipe that writes the estimate and flags it.

        Only `nutrition` and `extras` are set, so `patch_one`'s exclude_unset dump touches
        nothing else. Both are merged rather than replaced: a recipe may carry sodium or fiber
        from an import, and `extras` holds unrelated fork keys such as `servingUnit`. A
        replace here would silently drop whichever one this feature doesn't know about.
        """
        existing = recipe.nutrition.model_dump() if recipe.nutrition else {}
        estimated = {field: value for field, value in estimate.nutrition.model_dump().items() if value is not None}

        return Recipe(
            nutrition=Nutrition(**{**existing, **estimated}),
            extras={**(recipe.extras or {}), NUTRITION_ESTIMATED_KEY: NUTRITION_ESTIMATED_VALUE},
        )
