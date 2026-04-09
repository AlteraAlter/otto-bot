"""Add product query performance indexes

Revision ID: 20260409113000
Revises: 20260407153000
Create Date: 2026-04-09 11:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260409113000"
down_revision: Union[str, Sequence[str], None] = "20260407153000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _exec_autocommit(sql: str) -> None:
    context = op.get_context()
    with context.autocommit_block():
        op.execute(sa.text(sql))


def upgrade() -> None:
    """Upgrade schema."""
    _exec_autocommit(
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_product_descriptions_product_sku_name
        ON product_descriptions (product_sku, name)
        """
    )
    _exec_autocommit(
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_product_descriptions_non_empty_description_sku
        ON product_descriptions (product_sku)
        WHERE name = 'description' AND length(trim(value)) > 0
        """
    )

    _exec_autocommit(
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_product_category
        ON products (product_category)
        """
    )
    _exec_autocommit(
        """
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_product_category_normalized
        ON products ((lower(trim(product_category))))
        """
    )

    bind = op.get_bind()
    pg_trgm_available = bool(
        bind.execute(
            sa.text(
                "SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm' LIMIT 1"
            )
        ).scalar()
    )

    if pg_trgm_available:
        _exec_autocommit("CREATE EXTENSION IF NOT EXISTS pg_trgm")

        trigram_columns = [
            "sku",
            "product_reference",
            "ean",
            "moin",
            "product_category",
            "marketplace_status",
            "error_message",
            "active_status",
        ]

        for column in trigram_columns:
            _exec_autocommit(
                f"""
                CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_products_{column}_trgm
                ON products USING gin ({column} gin_trgm_ops)
                """
            )


def downgrade() -> None:
    """Downgrade schema."""
    trigram_columns = [
        "sku",
        "product_reference",
        "ean",
        "moin",
        "product_category",
        "marketplace_status",
        "error_message",
        "active_status",
    ]

    for column in trigram_columns:
        _exec_autocommit(f'DROP INDEX CONCURRENTLY IF EXISTS "ix_products_{column}_trgm"')

    _exec_autocommit('DROP INDEX CONCURRENTLY IF EXISTS "ix_products_product_category_normalized"')
    _exec_autocommit('DROP INDEX CONCURRENTLY IF EXISTS "ix_products_product_category"')
    _exec_autocommit(
        'DROP INDEX CONCURRENTLY IF EXISTS "ix_product_descriptions_non_empty_description_sku"'
    )
    _exec_autocommit('DROP INDEX CONCURRENTLY IF EXISTS "ix_product_descriptions_product_sku_name"')
