"""remove user invitations table

Revision ID: 20260528170000
Revises: 20260519133000
Create Date: 2026-05-28 17:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260528170000"
down_revision = "20260519133000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_user_invitations_email"), table_name="user_invitations")
    op.drop_table("user_invitations")


def downgrade() -> None:
    op.create_table(
        "user_invitations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.Enum("SEO", "EMPLOYEE", name="role_enum", create_type=False), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("invited_by", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_user_invitations_email"), "user_invitations", ["email"], unique=False)
