"""Expand branding_assets for multi-slot branding and seed extended system_settings defaults

Revision ID: 0007_extended_branding_and_settings
Revises: 0006_case_insensitive_user_indexes
Create Date: 2026-11-20 08:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_extended_branding_and_settings"
down_revision = "0006_case_insensitive_user_indexes"
branch_labels = None
depends_on = None


DEFAULT_SETTINGS = [
    ("appName", "Oromia Polio Campaign Management System (OHB-OPCMS)"),
    ("appShortName", "OHB-OPCMS"),
    ("organizationName", "Oromia Health Bureau"),
    ("appTagline", "Central Command Center – nOPV2 and bOPV2 Supplementary Immunization Activities"),
    ("footerText", "Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System"),
    ("timezone", "Africa/Addis_Ababa"),
    ("dateFormat", "YYYY-MM-DD"),
    ("supportContact", "phem@oromiahealth.gov.et"),
    ("primaryColor", "#485EA9"),
    ("secondaryColor", "#3A99CF"),
    ("accentColor", "#D29441"),
    ("surfaceColor", "#F8FAFC"),
    ("displayFont", "Plus Jakarta Sans"),
    ("bodyFont", "DM Sans"),
    ("fontScale", "standard"),
    ("loginTheme", "clean_light"),
    ("defaultLanguage", "en"),
    ("allowUserLanguageSwitch", "true"),
    ("defaultCampaignId", "1"),
    ("dashboardAutoRefreshSec", "30"),
    ("showDataQualityBanner", "true"),
    ("defaultLandingPage", "live_command_center"),
    ("disabledModules", ""),
    ("sidebarCollapsedDefault", "false"),
    ("showFooterBranding", "true"),
    ("uiDensity", "comfortable"),
    ("tableRowsPerPage", "25"),
    ("showAnimations", "true"),
    ("highContrastMode", "false"),
    ("liveCommandAutoRefresh", "true"),
    ("liveCommandShowTicker", "true"),
    ("maxUploadSizeMb", "25"),
    ("previewLinkTtlHours", "144"),
    ("requireImportConfirmation", "true"),
    ("retainArchivedBrandingAssets", "true"),
]


def upgrade() -> None:
    op.alter_column(
        "branding_assets",
        "asset_type",
        existing_type=sa.String(length=20),
        type_=sa.String(length=40),
        existing_nullable=False,
    )
    op.add_column(
        "branding_assets",
        sa.Column("sha256_checksum", sa.String(length=64), nullable=True),
    )

    conn = op.get_bind()
    for k, v in DEFAULT_SETTINGS:
        conn.execute(
            sa.text(
                "INSERT INTO system_settings (key, value) VALUES (:k, :v) ON CONFLICT (key) DO NOTHING"
            ),
            {"k": k, "v": v},
        )


def downgrade() -> None:
    op.drop_column("branding_assets", "sha256_checksum")
    op.alter_column(
        "branding_assets",
        "asset_type",
        existing_type=sa.String(length=40),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
