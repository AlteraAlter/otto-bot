"""add translation cache and russian display fields

Revision ID: 20260623120000
Revises: 20260603123000
Create Date: 2026-06-23 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260623120000"
down_revision = "20260603123000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("category_groups", sa.Column("name_ru", sa.String(), nullable=True))
    op.add_column("categories", sa.Column("name_ru", sa.String(), nullable=True))
    op.add_column("attributes", sa.Column("name_ru", sa.String(), nullable=True))
    op.add_column("attributes", sa.Column("description_ru", sa.Text(), nullable=True))
    op.add_column(
        "attribute_allowed_values",
        sa.Column("value_ru", sa.String(length=255), nullable=True),
    )

    op.create_table(
        "translation_cache",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column("source_lang", sa.String(length=10), nullable=True),
        sa.Column("target_lang", sa.String(length=10), nullable=False),
        sa.Column(
            "provider",
            sa.String(length=30),
            server_default="deepl",
            nullable=False,
        ),
        sa.Column("context", sa.String(length=50), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "original_text",
            "source_lang",
            "target_lang",
            "provider",
            "context",
            name="uq_translation_cache_lookup",
        ),
    )


def downgrade() -> None:
    op.drop_table("translation_cache")
    op.drop_column("attribute_allowed_values", "value_ru")
    op.drop_column("attributes", "description_ru")
    op.drop_column("attributes", "name_ru")
    op.drop_column("categories", "name_ru")
    op.drop_column("category_groups", "name_ru")
