"""add product creation tasks

Revision ID: 20260519133000
Revises: 20260409113000
Create Date: 2026-05-19 13:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260519133000"
down_revision = "20260409113000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_creation_tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("controller", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("process_id", sa.String(length=64), nullable=True),
        sa.Column("process_state", sa.String(length=32), nullable=True),
        sa.Column("total_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "request_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False
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
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_product_creation_tasks_created_by_user_id"),
        "product_creation_tasks",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_product_creation_tasks_status"),
        "product_creation_tasks",
        ["status"],
        unique=False,
    )

    op.create_table(
        "product_creation_task_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("item_index", sa.Integer(), nullable=False),
        sa.Column("sku", sa.String(length=128), nullable=False),
        sa.Column("product_reference", sa.String(length=255), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "availability_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("create_status_ru", sa.String(length=80), nullable=True),
        sa.Column("availability_status_ru", sa.String(length=80), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["task_id"], ["product_creation_tasks.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_product_creation_task_items_task_id"),
        "product_creation_task_items",
        ["task_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_product_creation_task_items_sku"),
        "product_creation_task_items",
        ["sku"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_product_creation_task_items_sku"),
        table_name="product_creation_task_items",
    )
    op.drop_index(
        op.f("ix_product_creation_task_items_task_id"),
        table_name="product_creation_task_items",
    )
    op.drop_table("product_creation_task_items")
    op.drop_index(
        op.f("ix_product_creation_tasks_status"), table_name="product_creation_tasks"
    )
    op.drop_index(
        op.f("ix_product_creation_tasks_created_by_user_id"),
        table_name="product_creation_tasks",
    )
    op.drop_table("product_creation_tasks")
