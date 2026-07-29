"""merge heads

Revision ID: b2b00c7bf84f
Revises: 20260603123000, 96d979a027de
Create Date: 2026-06-08 11:08:12.243429

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b2b00c7bf84f"
down_revision: Union[str, Sequence[str], None] = ("20260603123000", "96d979a027de")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
