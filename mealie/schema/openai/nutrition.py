from pydantic import Field

from ._base import OpenAIBase


class OpenAINutrition(OpenAIBase):
    calories: float | None = Field(
        None,
        description="Estimated energy for ONE serving, in kilocalories (kcal).",
    )
    protein_content: float | None = Field(
        None,
        description="Estimated protein for ONE serving, in grams.",
    )
    carbohydrate_content: float | None = Field(
        None,
        description="Estimated total carbohydrate for ONE serving, in grams.",
    )
    fat_content: float | None = Field(
        None,
        description="Estimated total fat for ONE serving, in grams.",
    )
    confidence: float | None = Field(
        None,
        description=(
            "How confident you are in this estimate, from 0 to 1. Lower it when quantities are "
            "missing or vague, when the yield is unclear, or when a branded item has no close "
            "generic equivalent."
        ),
    )
    basis: str | None = Field(
        None,
        description=(
            "One short sentence naming the main assumptions behind the estimate, e.g. what you "
            "substituted for a branded product or which items you treated as negligible. This is "
            "shown to the user so they can judge whether to trust the number."
        ),
    )
