"""add product variants

Revision ID: 20260624120000
Revises: f187c05e21e8, 20260623120000
Create Date: 2026-06-24 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260624120000"
down_revision: Union[str, Sequence[str], None] = (
    "f187c05e21e8",
    "20260623120000",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_variants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("product_reference", sa.String(), nullable=True),
        sa.Column("combination_key", sa.String(length=1000), nullable=False),
        sa.Column(
            "variation_attributes_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "copied_product_data_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("ean", sa.String(), nullable=True),
        sa.Column("sku", sa.String(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("image_path", sa.String(), nullable=True),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("media_asset_links", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("status", sa.String(length=40), server_default="draft", nullable=False),
        sa.Column("generation_error", sa.Text(), nullable=True),
        sa.Column(
            "source",
            sa.String(length=20),
            server_default="generated",
            nullable=False,
        ),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_product_variants_product_id",
        "product_variants",
        ["product_id"],
    )
    op.create_index(
        "ix_product_variants_product_reference",
        "product_variants",
        ["product_reference"],
    )
    op.create_index(
        "uq_product_variants_product_combination_active",
        "product_variants",
        ["product_id", "combination_key"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )
    op.create_index(
        "uq_product_variants_sku_active",
        "product_variants",
        ["sku"],
        unique=True,
        postgresql_where=sa.text("sku IS NOT NULL AND sku <> '' AND is_deleted = false"),
    )
    op.create_index(
        "uq_product_variants_ean_active",
        "product_variants",
        ["ean"],
        unique=True,
        postgresql_where=sa.text("ean IS NOT NULL AND ean <> '' AND is_deleted = false"),
    )


def downgrade() -> None:
    op.drop_index("uq_product_variants_ean_active", table_name="product_variants")
    op.drop_index("uq_product_variants_sku_active", table_name="product_variants")
    op.drop_index(
        "uq_product_variants_product_combination_active",
        table_name="product_variants",
    )
    op.drop_index("ix_product_variants_product_reference", table_name="product_variants")
    op.drop_index("ix_product_variants_product_id", table_name="product_variants")
    op.drop_table("product_variants")
