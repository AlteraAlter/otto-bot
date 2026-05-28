"""create factories table

Revision ID: 4e81d98ae87f
Revises: 20260519133000
Create Date: 2026-05-25 11:13:32.703824
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "4e81d98ae87f"
down_revision: Union[str, Sequence[str], None] = "20260519133000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "factories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("factory_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("items_count", sa.Integer(), nullable=False),
        sa.Column("last_changed_at", sa.DateTime(timezone=False), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("factory_id"),
    )


def downgrade() -> None:
    op.drop_table("factories")
