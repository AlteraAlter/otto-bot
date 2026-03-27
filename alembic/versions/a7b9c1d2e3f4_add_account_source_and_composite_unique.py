"""add account source and composite unique for products

Revision ID: a7b9c1d2e3f4
Revises: 2c93a05dcd94
Create Date: 2026-03-26 20:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7b9c1d2e3f4"
down_revision: Union[str, Sequence[str], None] = "2c93a05dcd94"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE products "
        "ADD COLUMN IF NOT EXISTS account_source VARCHAR(20) NOT NULL DEFAULT 'JV'"
    )
    op.execute(
        'ALTER TABLE products ALTER COLUMN "productReference" TYPE VARCHAR USING "productReference"::varchar'
    )
    op.execute(
        "ALTER TABLE products ALTER COLUMN pricing TYPE DOUBLE PRECISION USING pricing::double precision"
    )
    op.execute("ALTER TABLE products ALTER COLUMN ean DROP NOT NULL")
    op.execute('ALTER TABLE products ALTER COLUMN "productReference" DROP NOT NULL')
    op.execute("ALTER TABLE products ALTER COLUMN brand_id DROP NOT NULL")
    op.execute("ALTER TABLE products ALTER COLUMN category DROP NOT NULL")
    op.execute('ALTER TABLE products ALTER COLUMN "productLine" DROP NOT NULL')
    op.execute("ALTER TABLE products ALTER COLUMN description DROP NOT NULL")

    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key")
    op.execute(
        "ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_sku_account"
    )
    op.create_unique_constraint(
        "uq_products_sku_account", "products", ["sku", "account_source"]
    )


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_sku_account")
    op.create_unique_constraint("products_sku_key", "products", ["sku"])

    op.execute(
        'ALTER TABLE products ALTER COLUMN "productReference" TYPE INTEGER USING NULLIF("productReference", \'\')::integer'
    )
    op.execute(
        "ALTER TABLE products ALTER COLUMN pricing TYPE INTEGER USING pricing::integer"
    )
    op.execute("ALTER TABLE products ALTER COLUMN ean SET NOT NULL")
    op.execute('ALTER TABLE products ALTER COLUMN "productReference" SET NOT NULL')
    op.execute("ALTER TABLE products ALTER COLUMN brand_id SET NOT NULL")
    op.execute("ALTER TABLE products ALTER COLUMN category SET NOT NULL")
    op.execute('ALTER TABLE products ALTER COLUMN "productLine" SET NOT NULL')
    op.execute("ALTER TABLE products ALTER COLUMN description SET NOT NULL")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS account_source")
