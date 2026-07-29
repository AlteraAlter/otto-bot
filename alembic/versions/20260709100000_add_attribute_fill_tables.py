"""add attribute fill orchestration tables

Revision ID: 20260709100000
Revises: 20260708110000
Create Date: 2026-07-09 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260709100000"
down_revision = "20260708110000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attribute_fill_chunks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("process_id", sa.String(length=64), nullable=False),
        sa.Column("chunk_id", sa.Integer(), nullable=False),
        sa.Column("ai_key_slot", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("product_count", sa.Integer(), nullable=False),
        sa.Column("processed_count", sa.Integer(), nullable=False),
        sa.Column("updated_count", sa.Integer(), nullable=False),
        sa.Column("skipped_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("generated_attributes", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["process_id"], ["factory_task_states.process_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("process_id", "chunk_id", name="uq_attribute_fill_chunk"),
    )
    op.create_index(
        op.f("ix_attribute_fill_chunks_process_id"),
        "attribute_fill_chunks",
        ["process_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_chunks_ai_key_slot"),
        "attribute_fill_chunks",
        ["ai_key_slot"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_chunks_status"),
        "attribute_fill_chunks",
        ["status"],
        unique=False,
    )

    op.create_table(
        "attribute_fill_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("process_id", sa.String(length=64), nullable=False),
        sa.Column("chunk_id", sa.Integer(), nullable=True),
        sa.Column("ai_key_slot", sa.Integer(), nullable=True),
        sa.Column("sku", sa.String(length=128), nullable=False),
        sa.Column("ean", sa.String(length=64), nullable=True),
        sa.Column("product_reference", sa.String(length=255), nullable=True),
        sa.Column("product_category", sa.String(length=255), nullable=True),
        sa.Column(
            "active_status", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "marketplace_status", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "raw_product", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column(
            "result_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("attributes_added", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["process_id"], ["factory_task_states.process_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("process_id", "sku", name="uq_attribute_fill_item_sku"),
    )
    op.create_index(
        op.f("ix_attribute_fill_items_process_id"),
        "attribute_fill_items",
        ["process_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_items_chunk_id"),
        "attribute_fill_items",
        ["chunk_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_items_ai_key_slot"),
        "attribute_fill_items",
        ["ai_key_slot"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_items_sku"),
        "attribute_fill_items",
        ["sku"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_items_ean"),
        "attribute_fill_items",
        ["ean"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_items_product_category"),
        "attribute_fill_items",
        ["product_category"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_items_is_active"),
        "attribute_fill_items",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_attribute_fill_items_status"),
        "attribute_fill_items",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_attribute_fill_items_process_chunk_status",
        "attribute_fill_items",
        ["process_id", "chunk_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_attribute_fill_items_process_chunk_status",
        table_name="attribute_fill_items",
    )
    op.drop_index(
        op.f("ix_attribute_fill_items_status"), table_name="attribute_fill_items"
    )
    op.drop_index(
        op.f("ix_attribute_fill_items_is_active"), table_name="attribute_fill_items"
    )
    op.drop_index(
        op.f("ix_attribute_fill_items_product_category"),
        table_name="attribute_fill_items",
    )
    op.drop_index(
        op.f("ix_attribute_fill_items_ean"), table_name="attribute_fill_items"
    )
    op.drop_index(
        op.f("ix_attribute_fill_items_sku"), table_name="attribute_fill_items"
    )
    op.drop_index(
        op.f("ix_attribute_fill_items_ai_key_slot"), table_name="attribute_fill_items"
    )
    op.drop_index(
        op.f("ix_attribute_fill_items_chunk_id"), table_name="attribute_fill_items"
    )
    op.drop_index(
        op.f("ix_attribute_fill_items_process_id"), table_name="attribute_fill_items"
    )
    op.drop_table("attribute_fill_items")

    op.drop_index(
        op.f("ix_attribute_fill_chunks_status"), table_name="attribute_fill_chunks"
    )
    op.drop_index(
        op.f("ix_attribute_fill_chunks_ai_key_slot"), table_name="attribute_fill_chunks"
    )
    op.drop_index(
        op.f("ix_attribute_fill_chunks_process_id"), table_name="attribute_fill_chunks"
    )
    op.drop_table("attribute_fill_chunks")
