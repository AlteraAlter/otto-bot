"""add product image cache

Revision ID: 20260721170000
Revises: 20260721160000
Create Date: 2026-07-21 17:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260721170000"
down_revision = "20260721160000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_image_cache",
        sa.Column("ean", sa.String(), nullable=False),
        sa.Column("product_id", sa.String(), nullable=True),
        sa.Column("gallery_url", sa.Text(), nullable=True),
        sa.Column("picture_urls", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("media_asset_links", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("account", sa.String(length=20), nullable=True),
        sa.Column("product_factory_id", sa.String(), nullable=True),
        sa.Column("lister_factory_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("ean"),
        sa.UniqueConstraint("ean", name="uq_product_image_cache_ean"),
    )
    op.create_index(
        op.f("ix_product_image_cache_status"),
        "product_image_cache",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_product_image_cache_fetched_at"),
        "product_image_cache",
        ["fetched_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_product_image_cache_fetched_at"),
        table_name="product_image_cache",
    )
    op.drop_index(
        op.f("ix_product_image_cache_status"),
        table_name="product_image_cache",
    )
    op.drop_table("product_image_cache")
