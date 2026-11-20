"""Add case-insensitive unique indexes on users.username and users.email

Revision ID: 0006_case_insensitive_user_indexes
Revises: 0005_permanent_files_and_preview_links
Create Date: 2026-11-20 06:00:00.000000
"""

from alembic import op

revision = "0006_case_insensitive_user_indexes"
down_revision = "0005_permanent_files_and_preview_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower ON users (lower(username))"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_lower ON users (lower(email))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_email_lower")
    op.execute("DROP INDEX IF EXISTS ix_users_username_lower")
