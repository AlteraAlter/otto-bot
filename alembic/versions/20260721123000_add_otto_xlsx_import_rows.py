"""add OTTO XLSX import rows table

Revision ID: 20260721123000
Revises: 20260709100000
Create Date: 2026-07-21 12:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260721123000"
down_revision = "20260709100000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "otto_xlsx_import_rows",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("account", sa.String(length=20), nullable=False),
        sa.Column("source_file", sa.Text(), nullable=False),
        sa.Column("source_row", sa.Integer(), nullable=False),
        sa.Column("product_reference", sa.String(), nullable=True),
        sa.Column("sku", sa.String(), nullable=True),
        sa.Column("ean", sa.String(), nullable=True),
        sa.Column("moin", sa.String(), nullable=True),
        sa.Column("product_category", sa.String(), nullable=True),
        sa.Column("brand_id", sa.String(), nullable=True),
        sa.Column("brand", sa.String(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("recommended_retail_price", sa.Float(), nullable=True),
        sa.Column("marketplace_status", sa.String(), nullable=True),
        sa.Column("active_status", sa.String(), nullable=True),
        sa.Column("otto_url", sa.Text(), nullable=True),
        sa.Column("url_product_name", sa.Text(), nullable=True),
        sa.Column("normalized_name", sa.Text(), nullable=True),
        sa.Column(
            "raw_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "account",
            "source_file",
            "source_row",
            name="uq_otto_xlsx_import_account_file_row",
        ),
    )
    op.create_index(
        op.f("ix_otto_xlsx_import_rows_account"),
        "otto_xlsx_import_rows",
        ["account"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_import_rows_sku"),
        "otto_xlsx_import_rows",
        ["sku"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_import_rows_ean"),
        "otto_xlsx_import_rows",
        ["ean"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_import_rows_moin"),
        "otto_xlsx_import_rows",
        ["moin"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_import_rows_product_category"),
        "otto_xlsx_import_rows",
        ["product_category"],
        unique=False,
    )
    op.create_index(
        op.f("ix_otto_xlsx_import_rows_normalized_name"),
        "otto_xlsx_import_rows",
        ["normalized_name"],
        unique=False,
    )
    op.create_index(
        "ix_otto_xlsx_import_rows_account_name",
        "otto_xlsx_import_rows",
        ["account", "normalized_name"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_otto_xlsx_import_rows_account_name", table_name="otto_xlsx_import_rows"
    )
    op.drop_index(
        op.f("ix_otto_xlsx_import_rows_normalized_name"),
        table_name="otto_xlsx_import_rows",
    )
    op.drop_index(
        op.f("ix_otto_xlsx_import_rows_product_category"),
        table_name="otto_xlsx_import_rows",
    )
    op.drop_index(
        op.f("ix_otto_xlsx_import_rows_moin"), table_name="otto_xlsx_import_rows"
    )
    op.drop_index(
        op.f("ix_otto_xlsx_import_rows_ean"), table_name="otto_xlsx_import_rows"
    )
    op.drop_index(
        op.f("ix_otto_xlsx_import_rows_sku"), table_name="otto_xlsx_import_rows"
    )
    op.drop_index(
        op.f("ix_otto_xlsx_import_rows_account"), table_name="otto_xlsx_import_rows"
    )
    op.drop_table("otto_xlsx_import_rows")
