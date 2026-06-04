"""add factory task states

Revision ID: 20260603110000
Revises: 20260528170000
Create Date: 2026-06-03 11:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260603110000"
down_revision = "20260528170000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "factory_task_states",
        sa.Column("process_id", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("controller", sa.String(length=10), nullable=True),
        sa.Column("factory_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("current_step", sa.String(length=64), nullable=True),
        sa.Column(
            "task_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("process_id"),
    )
    op.create_index(
        op.f("ix_factory_task_states_created_by_user_id"),
        "factory_task_states",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_factory_task_states_controller"),
        "factory_task_states",
        ["controller"],
        unique=False,
    )
    op.create_index(
        op.f("ix_factory_task_states_factory_id"),
        "factory_task_states",
        ["factory_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_factory_task_states_status"),
        "factory_task_states",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_factory_task_states_current_step"),
        "factory_task_states",
        ["current_step"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_factory_task_states_current_step"),
        table_name="factory_task_states",
    )
    op.drop_index(
        op.f("ix_factory_task_states_status"),
        table_name="factory_task_states",
    )
    op.drop_index(
        op.f("ix_factory_task_states_factory_id"),
        table_name="factory_task_states",
    )
    op.drop_index(
        op.f("ix_factory_task_states_controller"),
        table_name="factory_task_states",
    )
    op.drop_index(
        op.f("ix_factory_task_states_created_by_user_id"),
        table_name="factory_task_states",
    )
    op.drop_table("factory_task_states")
