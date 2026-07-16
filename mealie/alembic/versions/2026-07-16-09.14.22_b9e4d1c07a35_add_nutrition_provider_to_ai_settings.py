"""add nutrition provider to ai provider settings

Revision ID: b9e4d1c07a35
Revises: 2187537c52b8
Create Date: 2026-07-16 09:14:22.118374

"""

import sqlalchemy as sa
from alembic import op

import mealie.db.migration_types

# revision identifiers, used by Alembic.
revision = "b9e4d1c07a35"
down_revision: str | None = "2187537c52b8"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade():
    # Nullable with no backfill on purpose: NULL means "use the default provider", so every
    # existing install keeps behaving exactly as it does today until someone picks a model.
    with op.batch_alter_table("ai_provider_settings", schema=None) as batch_op:
        batch_op.add_column(sa.Column("nutrition_provider_id", mealie.db.migration_types.GUID(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_ai_provider_settings_nutrition_provider_id"), ["nutrition_provider_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_ai_provider_settings_nutrition_provider_id",
            "ai_providers",
            ["nutrition_provider_id"],
            ["id"],
            use_alter=True,
        )


def downgrade():
    with op.batch_alter_table("ai_provider_settings", schema=None) as batch_op:
        batch_op.drop_constraint("fk_ai_provider_settings_nutrition_provider_id", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_ai_provider_settings_nutrition_provider_id"))
        batch_op.drop_column("nutrition_provider_id")
