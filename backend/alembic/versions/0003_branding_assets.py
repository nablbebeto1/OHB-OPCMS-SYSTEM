"""Add branding_assets table and guestPublicOverviewEnabled setting

Revision ID: 0003_branding_assets
Revises: 0002_command_room_and_viewer_role
Create Date: 2026-11-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_branding_assets"
down_revision = "0002_command_room_and_viewer_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "branding_assets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("asset_type", sa.String(length=20), nullable=False),
        sa.Column("original_filename", sa.String(length=300), nullable=False),
        sa.Column("stored_filename", sa.String(length=300), nullable=False, unique=True),
        sa.Column("stored_path", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("uploaded_by_name", sa.String(length=200), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_branding_assets_asset_type", "branding_assets", ["asset_type"])
    op.create_index("ix_branding_assets_is_active", "branding_assets", ["is_active"])

    op.execute(
        """
        INSERT INTO system_settings (key, value)
        VALUES ('guestPublicOverviewEnabled', 'false')
        ON CONFLICT (key) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_branding_assets_is_active", table_name="branding_assets")
    op.drop_index("ix_branding_assets_asset_type", table_name="branding_assets")
    op.drop_table("branding_assets")
    op.execute("DELETE FROM system_settings WHERE key = 'guestPublicOverviewEnabled';")
