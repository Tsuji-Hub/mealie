from fastapi import HTTPException, status

from mealie.routes._base import controller
from mealie.routes._base.routers import UserAPIRouter
from mealie.schema.recipe.recipe_nutrition_estimate import NutritionEstimate, NutritionEstimateRequest
from mealie.services.openai.openai import OpenAINotEnabledException
from mealie.services.recipe.nutrition_estimate_service import NutritionEstimateService, has_macros

from ._base import BaseRecipeController

router = UserAPIRouter(prefix="/recipes")


@controller(router)
class RecipeNutritionEstimateController(BaseRecipeController):
    @router.post("/{slug}/estimate-nutrition", response_model=NutritionEstimate)
    async def estimate_nutrition(self, slug: str, data: NutritionEstimateRequest | None = None) -> NutritionEstimate:
        """
        Estimate a recipe's per-serving macros with the group's configured AI provider.

        One recipe, one request, on demand. There is deliberately no bulk or fan-out path: the
        provider is on a free tier (~15 RPM / 1000 RPD, metered per project), and a batch route
        would let one bad prompt write wrong numbers across hundreds of recipes with no review.
        The importer drives this per recipe, throttled, from outside.
        """
        data = data or NutritionEstimateRequest()
        recipe = self.service.get_one(slug)

        # The FDL recipes carry true macros from the source and are what MacroFactor consumes.
        # They are ground truth: never overwrite them. Refusing loudly (rather than skipping
        # quietly) is what lets the importer walk all ~160 recipes and trust that a 409 means
        # "this one already had real numbers", not "the estimate silently did nothing".
        if data.save and has_macros(recipe.nutrition):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Recipe already has nutrition; refusing to overwrite it.",
            )

        estimate_service = NutritionEstimateService(self.repos)
        try:
            estimate = await estimate_service.estimate(recipe)
        except OpenAINotEnabledException as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No AI provider is configured.") from e
        except HTTPException:
            raise
        except Exception as e:
            self.handle_exceptions(e)
            raise

        if not data.save:
            return estimate

        # Patch, not update: a patch dumps with exclude_unset, so only nutrition and extras are
        # written and the ingredients, steps and settings are never round-tripped through this
        # route at all. Nothing it doesn't mean to touch can be lost.
        self.service.patch_one(recipe.slug, estimate_service.build_patch(recipe, estimate))
        estimate.saved = True
        return estimate
