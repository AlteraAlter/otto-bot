"""add product names to OTTO XLSX import rows

Revision ID: 20260721143000
Revises: 20260721133000
Create Date: 2026-07-21 14:30:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260721143000"
down_revision = "20260721133000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "otto_xlsx_import_rows",
        sa.Column("product_name", sa.Text(), nullable=True),
    )
    op.add_column(
        "otto_xlsx_import_rows",
        sa.Column("name_source", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("otto_xlsx_import_rows", "name_source")
    op.drop_column("otto_xlsx_import_rows", "product_name")
