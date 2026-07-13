"""make the OTTO category attribute cache refresh-safe

Revision ID: 20260708110000
Revises: d1f4c806768b
Create Date: 2026-07-08 11:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260708110000"
down_revision = "d1f4c806768b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attributes", sa.Column("attribute_group", sa.String(), nullable=True))
    op.add_column(
        "attributes",
        sa.Column(
            "feature_relevance",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )
    op.add_column(
        "attributes",
        sa.Column("unit_display_name", sa.String(), nullable=True),
    )

    op.drop_constraint("attributes_group_id_fkey", "attributes", type_="foreignkey")
    op.create_foreign_key(
        "attributes_group_id_fkey",
        "attributes",
        "category_groups",
        ["group_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(
        "attribute_allowed_values_attribute_id_fkey",
        "attribute_allowed_values",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "attribute_allowed_values_attribute_id_fkey",
        "attribute_allowed_values",
        "attributes",
        ["attribute_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(
        "variation_themes_attribute_id_fkey",
        "variation_themes",
        type_="foreignkey",
    )
    op.drop_constraint(
        "variation_themes_group_id_fkey",
        "variation_themes",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "variation_themes_attribute_id_fkey",
        "variation_themes",
        "attributes",
        ["attribute_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "variation_themes_group_id_fkey",
        "variation_themes",
        "category_groups",
        ["group_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_unique_constraint(
        "uq_attributes_group_name",
        "attributes",
        ["group_id", "name"],
    )
    op.create_unique_constraint(
        "uq_attribute_allowed_values_attribute_value",
        "attribute_allowed_values",
        ["attribute_id", "value"],
    )
    op.create_unique_constraint(
        "uq_variation_themes_group_attribute",
        "variation_themes",
        ["group_id", "attribute_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_variation_themes_group_attribute", "variation_themes", type_="unique"
    )
    op.drop_constraint(
        "uq_attribute_allowed_values_attribute_value",
        "attribute_allowed_values",
        type_="unique",
    )
    op.drop_constraint("uq_attributes_group_name", "attributes", type_="unique")

    op.drop_constraint(
        "variation_themes_attribute_id_fkey",
        "variation_themes",
        type_="foreignkey",
    )
    op.drop_constraint(
        "variation_themes_group_id_fkey",
        "variation_themes",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "variation_themes_attribute_id_fkey",
        "variation_themes",
        "attributes",
        ["attribute_id"],
        ["id"],
    )
    op.create_foreign_key(
        "variation_themes_group_id_fkey",
        "variation_themes",
        "category_groups",
        ["group_id"],
        ["id"],
    )
    op.drop_constraint(
        "attribute_allowed_values_attribute_id_fkey",
        "attribute_allowed_values",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "attribute_allowed_values_attribute_id_fkey",
        "attribute_allowed_values",
        "attributes",
        ["attribute_id"],
        ["id"],
    )
    op.drop_constraint("attributes_group_id_fkey", "attributes", type_="foreignkey")
    op.create_foreign_key(
        "attributes_group_id_fkey",
        "attributes",
        "category_groups",
        ["group_id"],
        ["id"],
    )

    op.drop_column("attributes", "unit_display_name")
    op.drop_column("attributes", "feature_relevance")
    op.drop_column("attributes", "attribute_group")
