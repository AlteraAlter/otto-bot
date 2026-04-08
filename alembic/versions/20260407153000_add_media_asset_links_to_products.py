"""Add media asset links to products

Revision ID: 20260407153000
Revises: 20260407120000
Create Date: 2026-04-07 15:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260407153000"
down_revision: Union[str, Sequence[str], None] = "20260407120000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "products",
        sa.Column(
            "media_asset_links",
            postgresql.ARRAY(sa.String()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("products", "media_asset_links")
