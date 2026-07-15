from pydantic import Field

from mealie.schema._mealie import MealieModel

from .recipe_nutrition import Nutrition

#: Marks a recipe's nutrition as AI-estimated rather than sourced. Lives in `recipe.extras`
#: (a free-form dict) so the fork needs no migration. The value is the string "true" because
#: extras are stored as strings; treat any other value as not estimated.
#:
#: This flag is the whole point of the feature. Ethan's FDL recipes carry true macros from
#: the source and are what MacroFactor consumes; the ~160 TikTok imports carry guesses. Mixed
#: in one grid with no marker, he loses the ability to tell which numbers he can trust — and
#: that trust is the only reason the FDL data is worth having.
NUTRITION_ESTIMATED_KEY = "nutrition_estimated"
NUTRITION_ESTIMATED_VALUE = "true"


class NutritionEstimateRequest(MealieModel):
    save: bool = Field(
        False,
        description=(
            "Persist the estimate to the recipe and flag it as estimated. Defaults to false so "
            "the UI can show the numbers for review before anything is written. The importer "
            "opts in per recipe."
        ),
    )


class NutritionEstimate(MealieModel):
    nutrition: Nutrition = Field(
        ...,
        description="The estimated macros, per serving, shaped so it can be PATCHed straight back onto the recipe.",
    )
    confidence: float | None = Field(None, description="The model's self-reported confidence, 0 to 1.")
    basis: str | None = Field(None, description="One sentence naming the assumptions behind the estimate.")
    saved: bool = Field(False, description="Whether this estimate was written to the recipe.")
