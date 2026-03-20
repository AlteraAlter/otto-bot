"""switch products pk to id

Revision ID: d92574373182
Revises: 38b4d2f5e571
Create Date: 2026-03-19 18:28:18.057829

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd92574373182'
down_revision: Union[str, Sequence[str], None] = '38b4d2f5e571'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
