"""add ean pool

Revision ID: 20260629120000
Revises: f6b6e9ddec37
Create Date: 2026-06-29 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260629120000"
down_revision: Union[str, Sequence[str], None] = "f6b6e9ddec37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ean_pool",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ean", sa.String(length=32), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default="available", nullable=False
        ),
        sa.Column("source", sa.String(length=40), nullable=True),
        sa.Column("reserved_for", sa.String(length=255), nullable=True),
        sa.Column("used_for", sa.String(length=255), nullable=True),
        sa.Column(
            "metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
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
        sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('available', 'reserved', 'used', 'disabled')",
            name="ck_ean_pool_status",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ean", name="uq_ean_pool_ean"),
    )
    op.create_index("ix_ean_pool_status", "ean_pool", ["status"])
    op.create_index("ix_ean_pool_source", "ean_pool", ["source"])
    op.create_index("ix_ean_pool_reserved_for", "ean_pool", ["reserved_for"])
    op.create_index("ix_ean_pool_used_for", "ean_pool", ["used_for"])


def downgrade() -> None:
    op.drop_index("ix_ean_pool_used_for", table_name="ean_pool")
    op.drop_index("ix_ean_pool_reserved_for", table_name="ean_pool")
    op.drop_index("ix_ean_pool_source", table_name="ean_pool")
    op.drop_index("ix_ean_pool_status", table_name="ean_pool")
    op.drop_table("ean_pool")
