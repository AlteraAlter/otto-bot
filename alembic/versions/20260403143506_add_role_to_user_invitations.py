"""Add role to user invitations

Revision ID: 20260403143506
Revises: 1e7555dfa8ec
Create Date: 2026-04-03 14:35:06.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260403143506"
down_revision: Union[str, Sequence[str], None] = "1e7555dfa8ec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "user_invitations",
        sa.Column(
            "role",
            sa.Enum("SEO", "EMPLOYEE", name="role_enum", create_type=False),
            nullable=True,
        ),
    )
    op.execute("UPDATE user_invitations SET role = 'EMPLOYEE' WHERE role IS NULL")
    op.alter_column("user_invitations", "role", nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user_invitations", "role")
