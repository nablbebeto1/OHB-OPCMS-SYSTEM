from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(40), nullable=False)
    assigned_zone = Column(String(150), nullable=True)
    assigned_woreda = Column(String(150), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    round_code = Column(String(80), unique=True, nullable=False)
    vaccines = Column(String(120), default="nOPV2 & bOPV2", nullable=False)
    start_date = Column(String(30), nullable=False)
    end_date = Column(String(30), nullable=False)
    expected_days = Column(Integer, default=4, nullable=False)
    status = Column(String(30), default="active", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AdminLocation(Base):
    __tablename__ = "admin_locations"
    __table_args__ = (
        UniqueConstraint("canonical_zone", "canonical_woreda", name="uq_zone_woreda"),
    )

    id = Column(Integer, primary_key=True, index=True)
    serial_no = Column(Integer, nullable=True)
    raw_region = Column(String(100), nullable=False)
    raw_zone = Column(String(150), nullable=False)
    raw_woreda = Column(String(150), nullable=False)
    canonical_region = Column(String(100), nullable=False, default="Oromia")
    canonical_zone = Column(String(150), nullable=False, index=True)
    canonical_woreda = Column(String(150), nullable=False, index=True)
    location_type = Column(String(60), nullable=False, default="Zone Woreda")
    planned_target = Column(Integer, nullable=False, default=0)
    daily_target = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    original_filename = Column(String(300), nullable=False)
    stored_path = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    file_format = Column(String(20), nullable=False)
    detected_template = Column(String(255), nullable=False)
    import_mode = Column(String(40), nullable=False)
    validation_status = Column(String(40), nullable=False)
    detected_records = Column(Integer, default=0, nullable=False)
    imported_records = Column(Integer, default=0, nullable=False)
    updated_records = Column(Integer, default=0, nullable=False)
    skipped_records = Column(Integer, default=0, nullable=False)
    rejected_records = Column(Integer, default=0, nullable=False)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_by_name = Column(String(200), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)
    status = Column(String(30), default="confirmed", nullable=False)
    rolled_back_at = Column(DateTime, nullable=True)
    rolled_back_by_name = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)


class CampaignDailyReport(Base):
    __tablename__ = "campaign_daily_reports"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=False, index=True)
    serial_no = Column(Integer, nullable=True)
    raw_region = Column(String(100), nullable=False)
    raw_zone = Column(String(150), nullable=False)
    raw_woreda = Column(String(150), nullable=False)
    canonical_region = Column(String(100), default="Oromia", nullable=False)
    canonical_zone = Column(String(150), nullable=False, index=True)
    canonical_woreda = Column(String(150), nullable=False, index=True)
    campaign_day_label = Column(String(40), nullable=False)
    campaign_day_num = Column(Integer, nullable=False, index=True)
    report_date = Column(String(30), nullable=True)

    # Target vs Coverage
    total_planned_target = Column(Integer, default=0, nullable=False)
    daily_target = Column(Integer, default=0, nullable=False)
    vacc_0_11_before = Column(Integer, default=0, nullable=False)
    vacc_0_11_not_before = Column(Integer, default=0, nullable=False)
    vacc_12_59_before = Column(Integer, default=0, nullable=False)
    vacc_12_59_not_before = Column(Integer, default=0, nullable=False)
    vacc_60_120_before = Column(Integer, default=0, nullable=False)
    vacc_60_120_not_before = Column(Integer, default=0, nullable=False)
    total_vaccinated_0_59 = Column(Integer, default=0, nullable=False)
    daily_covered_pct = Column(Float, default=0.0, nullable=False)
    covered_from_total_pct = Column(Float, default=0.0, nullable=False)

    # nOPV2 Vaccine Utilization
    nopv2_vials_received = Column(Integer, nullable=True)
    nopv2_vials_used = Column(Integer, nullable=True)
    nopv2_vials_partially_used = Column(Integer, nullable=True)
    nopv2_vials_returned_unused_good = Column(Integer, nullable=True)
    nopv2_vials_broken = Column(Integer, nullable=True)
    nopv2_vials_returned_bad = Column(Integer, nullable=True)
    nopv2_vials_lost = Column(Integer, nullable=True)
    nopv2_wastage_rate_pct = Column(Float, nullable=True)

    # bOPV Vaccine Utilization
    bopv_vials_received = Column(Integer, nullable=True)
    bopv_vials_used = Column(Integer, nullable=True)
    bopv_vials_partially_used = Column(Integer, nullable=True)
    bopv_vials_returned_unused_good = Column(Integer, nullable=True)
    bopv_vials_broken = Column(Integer, nullable=True)
    bopv_vials_returned_bad = Column(Integer, nullable=True)
    bopv_vials_lost = Column(Integer, nullable=True)
    bopv_wastage_rate_pct = Column(Float, nullable=True)

    # Surveillance
    afp_alerts_count = Column(Integer, default=0, nullable=False)
    aefi_alerts_count = Column(Integer, default=0, nullable=False)

    # Social Mobilization
    sm_hhs_visited = Column(Integer, default=0, nullable=False)
    sm_group_discussions = Column(Integer, default=0, nullable=False)
    sm_ipc_reached = Column(Integer, default=0, nullable=False)

    # Zero Dose Integration
    zd_identified_linked = Column(Integer, default=0, nullable=False)
    zd_vaccinated = Column(Integer, default=0, nullable=False)

    # Under-vaccinated Children
    uv_identified_linked = Column(Integer, default=0, nullable=False)
    uv_vaccinated = Column(Integer, default=0, nullable=False)

    # Vaccination Teams
    teams_total = Column(Integer, default=0, nullable=False)
    teams_reported = Column(Integer, default=0, nullable=False)
    remarks = Column(Text, default="", nullable=False)

    has_reported_activity = Column(Boolean, default=False, nullable=False)
    source_submitted_at = Column(String(50), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    superseded_by_import_id = Column(Integer, nullable=True)

    alerts = relationship("SurveillanceAlert", back_populates="report")


class SurveillanceAlert(Base):
    __tablename__ = "surveillance_alerts"
    __table_args__ = (
        UniqueConstraint("report_id", "alert_type", name="uq_report_alert_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    report_id = Column(Integer, ForeignKey("campaign_daily_reports.id"), nullable=False)
    alert_type = Column(String(10), nullable=False)
    canonical_zone = Column(String(150), nullable=False)
    canonical_woreda = Column(String(150), nullable=False)
    campaign_day_num = Column(Integer, nullable=False)
    report_date = Column(String(30), nullable=True)
    administrative_alert_count = Column(Integer, default=0, nullable=False)
    verified_clinical_cases = Column(Integer, default=0, nullable=False)
    clinical_status = Column(String(40), default="reported_pending", nullable=False)
    source_remarks = Column(Text, default="", nullable=False)
    follow_up_notes = Column(Text, default="", nullable=False)
    assigned_investigator = Column(String(200), default="", nullable=False)
    updated_by_name = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    report = relationship("CampaignDailyReport", back_populates="alerts")


class GeoBoundary(Base):
    __tablename__ = "geo_boundaries"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String(20), nullable=False)
    name_field = Column(String(80), nullable=False)
    feature_count = Column(Integer, nullable=False)
    geojson_text = Column(Text, nullable=False)
    uploaded_by_name = Column(String(200), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(80), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String(100), nullable=False)
    user_role = Column(String(40), nullable=False)
    action = Column(String(80), nullable=False)
    entity_type = Column(String(80), nullable=False)
    entity_id = Column(String(80), nullable=False)
    details = Column(Text, nullable=False)
    ip_address = Column(String(60), default="127.0.0.1", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class BrandingAsset(Base):
    __tablename__ = "branding_assets"

    id = Column(Integer, primary_key=True, index=True)
    asset_type = Column(String(20), nullable=False, index=True)  # 'logo' or 'favicon'
    original_filename = Column(String(300), nullable=False)
    stored_filename = Column(String(300), unique=True, nullable=False)
    stored_path = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_by_name = Column(String(200), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

