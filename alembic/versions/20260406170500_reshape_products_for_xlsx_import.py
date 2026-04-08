"""Reshape products table for XLSX import

Revision ID: 20260406170500
Revises: 20260403143506
Create Date: 2026-04-06 17:05:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260406170500"
down_revision: Union[str, Sequence[str], None] = "20260403143506"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column("products", "productReference", new_column_name="product_reference")
    op.alter_column("products", "category", new_column_name="product_category")
    op.alter_column("products", "pricing", new_column_name="price")

    op.add_column("products", sa.Column("moin", sa.String(), nullable=True))
    op.add_column("products", sa.Column("delivery_time", sa.String(), nullable=True))
    op.add_column(
        "products",
        sa.Column("recommended_retail_price", sa.Float(), nullable=True),
    )
    op.add_column("products", sa.Column("sale_price", sa.Float(), nullable=True))
    op.add_column("products", sa.Column("sale_start", sa.DateTime(), nullable=True))
    op.add_column("products", sa.Column("sale_end", sa.DateTime(), nullable=True))
    op.add_column("products", sa.Column("marketplace_status", sa.String(), nullable=True))
    op.add_column("products", sa.Column("error_message", sa.String(), nullable=True))
    op.add_column("products", sa.Column("active_status", sa.String(), nullable=True))
    op.add_column("products", sa.Column("otto_url", sa.String(), nullable=True))
    op.add_column("products", sa.Column("last_changed_at", sa.DateTime(), nullable=True))

    op.alter_column("products", "sku", existing_type=sa.String(), nullable=True)
    op.alter_column(
        "products", "product_reference", existing_type=sa.String(), nullable=True
    )
    op.alter_column("products", "price", existing_type=sa.Float(), nullable=True)

    op.drop_column("products", "account_source")
    op.drop_column("products", "vat")
    op.drop_column("products", "brand_id")
    op.drop_column("products", "productLine")
    op.drop_column("products", "description")
    op.drop_column("products", "bullet_points")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "products",
        sa.Column("bullet_points", sa.ARRAY(sa.String()), nullable=False, server_default="{}"),
    )
    op.add_column("products", sa.Column("description", sa.String(), nullable=True))
    op.add_column("products", sa.Column("productLine", sa.String(), nullable=True))
    op.add_column("products", sa.Column("brand_id", sa.String(), nullable=True))
    op.add_column(
        "products",
        sa.Column(
            "vat",
            sa.Enum("FULL", "REDUCED", "FREE", "NONE", name="vat_enum"),
            nullable=False,
            server_default="NONE",
        ),
    )
    op.add_column(
        "products",
        sa.Column("account_source", sa.String(length=20), nullable=False, server_default="JV"),
    )

    op.alter_column("products", "price", existing_type=sa.Float(), nullable=False)
    op.alter_column(
        "products", "product_reference", existing_type=sa.String(), nullable=True
    )
    op.alter_column("products", "sku", existing_type=sa.String(), nullable=False)

    op.drop_column("products", "last_changed_at")
    op.drop_column("products", "otto_url")
    op.drop_column("products", "active_status")
    op.drop_column("products", "error_message")
    op.drop_column("products", "marketplace_status")
    op.drop_column("products", "sale_end")
    op.drop_column("products", "sale_start")
    op.drop_column("products", "sale_price")
    op.drop_column("products", "recommended_retail_price")
    op.drop_column("products", "delivery_time")
    op.drop_column("products", "moin")

    op.alter_column("products", "price", new_column_name="pricing")
    op.alter_column("products", "product_category", new_column_name="category")
    op.alter_column("products", "product_reference", new_column_name="productReference")
