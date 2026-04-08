"""Add JV lister table

Revision ID: 20260407120000
Revises: 20260406183000
Create Date: 2026-04-07 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260407120000"
down_revision: Union[str, Sequence[str], None] = "20260406183000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "jv_lister",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account", sa.String(length=50), nullable=False),
        sa.Column("remote_product_id", sa.String(length=100), nullable=False),
        sa.Column("dataset", sa.String(length=50), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "fetched_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "account",
            "remote_product_id",
            name="uq_jv_lister_account_remote_product_id",
        ),
    )
    op.create_index(op.f("ix_jv_lister_account"), "jv_lister", ["account"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_jv_lister_account"), table_name="jv_lister")
    op.drop_table("jv_lister")
