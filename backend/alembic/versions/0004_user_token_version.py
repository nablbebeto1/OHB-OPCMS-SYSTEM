"""Add token_version column to users for immediate JWT invalidation

Revision ID: 0004_user_token_version
Revises: 0003_branding_assets
Create Date: 2026-11-19
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_user_token_version"
down_revision = "0003_branding_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
