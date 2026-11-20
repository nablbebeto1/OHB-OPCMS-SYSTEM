"""Create permanent stored_files and file_preview_links tables

Revision ID: 0005_permanent_files_preview
Revises: 0004_user_token_version
Create Date: 2026-11-19
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_permanent_files_preview"
down_revision = "0004_user_token_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stored_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("file_uuid", sa.String(length=64), nullable=False, unique=True),
        sa.Column("original_filename", sa.String(length=300), nullable=False),
        sa.Column("stored_filename", sa.String(length=300), nullable=False, unique=True),
        sa.Column("extension", sa.String(length=20), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256_checksum", sa.String(length=64), nullable=True),
        sa.Column("module", sa.String(length=60), nullable=False, server_default="documents"),
        sa.Column("category", sa.String(length=80), nullable=False, server_default="general"),
        sa.Column("associated_record_type", sa.String(length=60), nullable=True),
        sa.Column("associated_record_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("relative_path", sa.String(length=500), nullable=False),
        sa.Column("storage_path", sa.String(length=600), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("uploaded_by_name", sa.String(length=200), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_stored_files_uuid", "stored_files", ["file_uuid"])
    op.create_index("ix_stored_files_module_cat", "stored_files", ["module", "category"])

    op.create_table(
        "file_preview_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("file_id", sa.Integer(), sa.ForeignKey("stored_files.id"), nullable=False),
        sa.Column("token_id", sa.String(length=64), nullable=False, unique=True),
        sa.Column("signature_hmac", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("revoked_by_name", sa.String(length=200), nullable=True),
        sa.Column("revoke_reason", sa.String(length=300), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by_name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_accessed_at", sa.DateTime(), nullable=True),
        sa.Column("access_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_file_preview_links_file_id", "file_preview_links", ["file_id"])
    op.create_index("ix_file_preview_links_token_id", "file_preview_links", ["token_id"])
    op.create_index("ix_file_preview_links_expires_at", "file_preview_links", ["expires_at"])

    op.add_column(
        "import_batches",
        sa.Column("stored_file_id", sa.Integer(), sa.ForeignKey("stored_files.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("import_batches", "stored_file_id")
    op.drop_index("ix_file_preview_links_expires_at", table_name="file_preview_links")
    op.drop_index("ix_file_preview_links_token_id", table_name="file_preview_links")
    op.drop_index("ix_file_preview_links_file_id", table_name="file_preview_links")
    op.drop_table("file_preview_links")
    op.drop_index("ix_stored_files_module_cat", table_name="stored_files")
    op.drop_index("ix_stored_files_uuid", table_name="stored_files")
    op.drop_table("stored_files")
