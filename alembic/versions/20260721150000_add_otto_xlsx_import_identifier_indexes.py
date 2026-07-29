"""add identifier indexes for OTTO XLSX import enrichment

Revision ID: 20260721150000
Revises: 20260721143000
Create Date: 2026-07-21 15:00:00.000000
"""

from alembic import op

revision = "20260721150000"
down_revision = "20260721143000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_otto_xlsx_import_rows_account_product_reference",
        "otto_xlsx_import_rows",
        ["account", "product_reference"],
        unique=False,
    )
    op.create_index(
        "ix_otto_xlsx_import_rows_account_sku",
        "otto_xlsx_import_rows",
        ["account", "sku"],
        unique=False,
    )
    op.create_index(
        "ix_otto_xlsx_import_rows_account_ean",
        "otto_xlsx_import_rows",
        ["account", "ean"],
        unique=False,
    )
    op.create_index(
        "ix_otto_xlsx_import_rows_account_moin",
        "otto_xlsx_import_rows",
        ["account", "moin"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_otto_xlsx_import_rows_account_moin",
        table_name="otto_xlsx_import_rows",
    )
    op.drop_index(
        "ix_otto_xlsx_import_rows_account_ean",
        table_name="otto_xlsx_import_rows",
    )
    op.drop_index(
        "ix_otto_xlsx_import_rows_account_sku",
        table_name="otto_xlsx_import_rows",
    )
    op.drop_index(
        "ix_otto_xlsx_import_rows_account_product_reference",
        table_name="otto_xlsx_import_rows",
    )
