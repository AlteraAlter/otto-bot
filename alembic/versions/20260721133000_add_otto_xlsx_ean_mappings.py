"""add OTTO XLSX EAN mappings table

Revision ID: 20260721133000
Revises: 20260721123000
Create Date: 2026-07-21 13:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260721133000"
down_revision = "20260721123000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "otto_xlsx_ean_mappings",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_account", sa.String(length=20), nullable=False),
        sa.Column("target_account", sa.String(length=20), nullable=False),
        sa.Column("source_import_row_id", sa.BigInteger(), nullable=True),
        sa.Column("target_import_row_id", sa.BigInteger(), nullable=True),
        sa.Column("source_ean", sa.String(), nullable=False),
        sa.Column("target_ean", sa.String(), nullable=True),
        sa.Column("source_product_category", sa.String(), nullable=True),
        sa.Column("target_product_category", sa.String(), nullable=True),
        sa.Column("source_name", sa.Text(), nullable=True),
        sa.Column("target_name", sa.Text(), nullable=True),
        sa.Column("source_normalized_name", sa.Text(), nullable=True),
        sa.Column("target_normalized_name", sa.Text(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("strategy", sa.String(length=50), nullable=False),
        sa.Column("candidate_count", sa.Integer(), nullable=False),
        sa.Column("match_reason", sa.Text(), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["source_import_row_id"],
            ["otto_xlsx_import_rows.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_import_row_id"],
            ["otto_xlsx_import_rows.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_account",
            "target_account",
            "source_ean",
            name="uq_otto_xlsx_ean_mapping_source_target_ean",
        ),
    )
    op.create_index(
        op.f("ix_otto_xlsx_ean_mappings_source_account"),
        "otto_xlsx_ean_mappings",
        ["source_account"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_ean_mappings_target_account"),
        "otto_xlsx_ean_mappings",
        ["target_account"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_ean_mappings_source_import_row_id"),
        "otto_xlsx_ean_mappings",
        ["source_import_row_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_ean_mappings_target_import_row_id"),
        "otto_xlsx_ean_mappings",
        ["target_import_row_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_ean_mappings_source_ean"),
        "otto_xlsx_ean_mappings",
        ["source_ean"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_ean_mappings_target_ean"),
        "otto_xlsx_ean_mappings",
        ["target_ean"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_ean_mappings_status"),
        "otto_xlsx_ean_mappings",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_otto_xlsx_ean_mappings_status"),
        table_name="otto_xlsx_ean_mappings",
    )
    op.drop_index(
        op.f("ix_otto_xlsx_ean_mappings_target_ean"),
        table_name="otto_xlsx_ean_mappings",
    )
    op.drop_index(
        op.f("ix_otto_xlsx_ean_mappings_source_ean"),
        table_name="otto_xlsx_ean_mappings",
    )
    op.drop_index(
        op.f("ix_otto_xlsx_ean_mappings_target_import_row_id"),
        table_name="otto_xlsx_ean_mappings",
    )
    op.drop_index(
        op.f("ix_otto_xlsx_ean_mappings_source_import_row_id"),
        table_name="otto_xlsx_ean_mappings",
    )
    op.drop_index(
        op.f("ix_otto_xlsx_ean_mappings_target_account"),
        table_name="otto_xlsx_ean_mappings",
    )
    op.drop_index(
        op.f("ix_otto_xlsx_ean_mappings_source_account"),
        table_name="otto_xlsx_ean_mappings",
    )
    op.drop_table("otto_xlsx_ean_mappings")
