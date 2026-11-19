"""Initial OHB-OPCMS PostgreSQL schema"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_opcms"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(40), nullable=False),
        sa.Column("assigned_zone", sa.String(150), nullable=True),
        sa.Column("assigned_woreda", sa.String(150), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("round_code", sa.String(80), nullable=False, unique=True),
        sa.Column("vaccines", sa.String(120), nullable=False),
        sa.Column("start_date", sa.String(30), nullable=False),
        sa.Column("end_date", sa.String(30), nullable=False),
        sa.Column("expected_days", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "admin_locations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("serial_no", sa.Integer(), nullable=True),
        sa.Column("raw_region", sa.String(100), nullable=False),
        sa.Column("raw_zone", sa.String(150), nullable=False),
        sa.Column("raw_woreda", sa.String(150), nullable=False),
        sa.Column("canonical_region", sa.String(100), nullable=False),
        sa.Column("canonical_zone", sa.String(150), nullable=False),
        sa.Column("canonical_woreda", sa.String(150), nullable=False),
        sa.Column("location_type", sa.String(60), nullable=False),
        sa.Column("planned_target", sa.Integer(), nullable=False),
        sa.Column("daily_target", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("canonical_zone", "canonical_woreda", name="uq_zone_woreda"),
    )

    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("original_filename", sa.String(300), nullable=False),
        sa.Column("stored_path", sa.String(500), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("file_format", sa.String(20), nullable=False),
        sa.Column("detected_template", sa.String(255), nullable=False),
        sa.Column("import_mode", sa.String(40), nullable=False),
        sa.Column("validation_status", sa.String(40), nullable=False),
        sa.Column("detected_records", sa.Integer(), nullable=False),
        sa.Column("imported_records", sa.Integer(), nullable=False),
        sa.Column("updated_records", sa.Integer(), nullable=False),
        sa.Column("skipped_records", sa.Integer(), nullable=False),
        sa.Column("rejected_records", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("uploaded_by_name", sa.String(200), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("rolled_back_at", sa.DateTime(), nullable=True),
        sa.Column("rolled_back_by_name", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "campaign_daily_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("import_batch_id", sa.Integer(), sa.ForeignKey("import_batches.id"), nullable=False),
        sa.Column("serial_no", sa.Integer(), nullable=True),
        sa.Column("raw_region", sa.String(100), nullable=False),
        sa.Column("raw_zone", sa.String(150), nullable=False),
        sa.Column("raw_woreda", sa.String(150), nullable=False),
        sa.Column("canonical_region", sa.String(100), nullable=False),
        sa.Column("canonical_zone", sa.String(150), nullable=False),
        sa.Column("canonical_woreda", sa.String(150), nullable=False),
        sa.Column("campaign_day_label", sa.String(40), nullable=False),
        sa.Column("campaign_day_num", sa.Integer(), nullable=False),
        sa.Column("report_date", sa.String(30), nullable=True),
        sa.Column("total_planned_target", sa.Integer(), nullable=False),
        sa.Column("daily_target", sa.Integer(), nullable=False),
        sa.Column("vacc_0_11_before", sa.Integer(), nullable=False),
        sa.Column("vacc_0_11_not_before", sa.Integer(), nullable=False),
        sa.Column("vacc_12_59_before", sa.Integer(), nullable=False),
        sa.Column("vacc_12_59_not_before", sa.Integer(), nullable=False),
        sa.Column("vacc_60_120_before", sa.Integer(), nullable=False),
        sa.Column("vacc_60_120_not_before", sa.Integer(), nullable=False),
        sa.Column("total_vaccinated_0_59", sa.Integer(), nullable=False),
        sa.Column("daily_covered_pct", sa.Float(), nullable=False),
        sa.Column("covered_from_total_pct", sa.Float(), nullable=False),
        sa.Column("nopv2_vials_received", sa.Integer(), nullable=True),
        sa.Column("nopv2_vials_used", sa.Integer(), nullable=True),
        sa.Column("nopv2_vials_partially_used", sa.Integer(), nullable=True),
        sa.Column("nopv2_vials_returned_unused_good", sa.Integer(), nullable=True),
        sa.Column("nopv2_vials_broken", sa.Integer(), nullable=True),
        sa.Column("nopv2_vials_returned_bad", sa.Integer(), nullable=True),
        sa.Column("nopv2_vials_lost", sa.Integer(), nullable=True),
        sa.Column("nopv2_wastage_rate_pct", sa.Float(), nullable=True),
        sa.Column("bopv_vials_received", sa.Integer(), nullable=True),
        sa.Column("bopv_vials_used", sa.Integer(), nullable=True),
        sa.Column("bopv_vials_partially_used", sa.Integer(), nullable=True),
        sa.Column("bopv_vials_returned_unused_good", sa.Integer(), nullable=True),
        sa.Column("bopv_vials_broken", sa.Integer(), nullable=True),
        sa.Column("bopv_vials_returned_bad", sa.Integer(), nullable=True),
        sa.Column("bopv_vials_lost", sa.Integer(), nullable=True),
        sa.Column("bopv_wastage_rate_pct", sa.Float(), nullable=True),
        sa.Column("afp_alerts_count", sa.Integer(), nullable=False),
        sa.Column("aefi_alerts_count", sa.Integer(), nullable=False),
        sa.Column("sm_hhs_visited", sa.Integer(), nullable=False),
        sa.Column("sm_group_discussions", sa.Integer(), nullable=False),
        sa.Column("sm_ipc_reached", sa.Integer(), nullable=False),
        sa.Column("zd_identified_linked", sa.Integer(), nullable=False),
        sa.Column("zd_vaccinated", sa.Integer(), nullable=False),
        sa.Column("uv_identified_linked", sa.Integer(), nullable=False),
        sa.Column("uv_vaccinated", sa.Integer(), nullable=False),
        sa.Column("teams_total", sa.Integer(), nullable=False),
        sa.Column("teams_reported", sa.Integer(), nullable=False),
        sa.Column("remarks", sa.Text(), nullable=False),
        sa.Column("has_reported_activity", sa.Boolean(), nullable=False),
        sa.Column("source_submitted_at", sa.String(50), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("superseded_by_import_id", sa.Integer(), nullable=True),
    )

    op.create_table(
        "surveillance_alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("campaign_daily_reports.id"), nullable=False),
        sa.Column("alert_type", sa.String(10), nullable=False),
        sa.Column("canonical_zone", sa.String(150), nullable=False),
        sa.Column("canonical_woreda", sa.String(150), nullable=False),
        sa.Column("campaign_day_num", sa.Integer(), nullable=False),
        sa.Column("report_date", sa.String(30), nullable=True),
        sa.Column("administrative_alert_count", sa.Integer(), nullable=False),
        sa.Column("verified_clinical_cases", sa.Integer(), nullable=False),
        sa.Column("clinical_status", sa.String(40), nullable=False),
        sa.Column("source_remarks", sa.Text(), nullable=False),
        sa.Column("follow_up_notes", sa.Text(), nullable=False),
        sa.Column("assigned_investigator", sa.String(200), nullable=False),
        sa.Column("updated_by_name", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("report_id", "alert_type", name="uq_report_alert_type"),
    )

    op.create_table(
        "geo_boundaries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("name_field", sa.String(80), nullable=False),
        sa.Column("feature_count", sa.Integer(), nullable=False),
        sa.Column("geojson_text", sa.Text(), nullable=False),
        sa.Column("uploaded_by_name", sa.String(200), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("user_role", sa.String(40), nullable=False),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("entity_type", sa.String(80), nullable=False),
        sa.Column("entity_id", sa.String(80), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("ip_address", sa.String(60), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("system_settings")
    op.drop_table("geo_boundaries")
    op.drop_table("surveillance_alerts")
    op.drop_table("campaign_daily_reports")
    op.drop_table("import_batches")
    op.drop_table("admin_locations")
    op.drop_table("campaigns")
    op.drop_table("users")
