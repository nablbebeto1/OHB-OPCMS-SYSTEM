import hashlib
import io
import json
import os
import uuid
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from .analytics import DEFAULT_SYSTEM_SETTINGS_MAP, get_system_settings
from .models import (
    AdminLocation,
    BrandingAsset,
    Campaign,
    CampaignDailyReport,
    FilePreviewLink,
    GeoBoundary,
    ImportBatch,
    StoredFile,
    SurveillanceAlert,
    SystemSetting,
    User,
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_resolve_under(root_dir: str, rel_path: str) -> str:
    clean_rel = rel_path.replace("\\", "/").lstrip("/")
    root_abs = os.path.abspath(root_dir)
    target = os.path.abspath(os.path.join(root_abs, clean_rel))
    if target != root_abs and not target.startswith(root_abs + os.sep):
        raise ValueError(f"Unsafe archive file path rejected: {rel_path}")
    return target


def _parse_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    if not val:
        return datetime.utcnow()
    s = str(val).strip()
    if s.endswith("Z"):
        s = s[:-1]
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return datetime.utcnow()


def _resolve_existing_user_id(db: Session, candidate: Any) -> Optional[int]:
    if candidate is None:
        return None
    try:
        uid = int(candidate)
    except (TypeError, ValueError):
        return None
    exists = db.query(User.id).filter(User.id == uid).first()
    return uid if exists else None


def _sync_pg_sequence(db: Session, table: str) -> None:
    try:
        db.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 1), true)"
            )
        )
    except Exception:
        pass


def create_application_backup(
    db: Session,
    upload_root: str,
    branding_root: str,
    backups_dir: str,
    user: User,
) -> Dict[str, Any]:
    os.makedirs(backups_dir, exist_ok=True)
    buf = io.BytesIO()
    file_checksums: Dict[str, str] = {}

    settings_rows = [
        {"key": r.key, "value": r.value, "updated_at": r.updated_at.isoformat() + "Z"}
        for r in db.query(SystemSetting).order_by(SystemSetting.key.asc()).all()
    ]
    branding_rows = db.query(BrandingAsset).order_by(BrandingAsset.id.asc()).all()
    branding_json = [
        {
            "id": b.id,
            "asset_type": b.asset_type,
            "original_filename": b.original_filename,
            "stored_filename": b.stored_filename,
            "stored_path": b.stored_path,
            "mime_type": b.mime_type,
            "file_size_bytes": b.file_size_bytes,
            "sha256_checksum": b.sha256_checksum,
            "width": b.width,
            "height": b.height,
            "is_active": 1 if b.is_active else 0,
            "uploaded_by_user_id": b.uploaded_by_user_id,
            "uploaded_by_name": b.uploaded_by_name,
            "uploaded_at": b.uploaded_at.isoformat() + "Z",
        }
        for b in branding_rows
    ]
    campaigns_json = [
        {
            "id": c.id,
            "name": c.name,
            "round_code": c.round_code,
            "vaccines": c.vaccines,
            "start_date": c.start_date,
            "end_date": c.end_date,
            "expected_days": c.expected_days,
            "status": c.status,
            "created_at": c.created_at.isoformat() + "Z",
        }
        for c in db.query(Campaign).order_by(Campaign.id.asc()).all()
    ]
    locations_json = [
        {
            "id": l.id,
            "serial_no": l.serial_no,
            "raw_region": l.raw_region,
            "raw_zone": l.raw_zone,
            "raw_woreda": l.raw_woreda,
            "canonical_region": l.canonical_region,
            "canonical_zone": l.canonical_zone,
            "canonical_woreda": l.canonical_woreda,
            "location_type": l.location_type,
            "planned_target": l.planned_target,
            "daily_target": l.daily_target,
            "is_active": 1 if l.is_active else 0,
        }
        for l in db.query(AdminLocation).order_by(AdminLocation.id.asc()).all()
    ]
    batches_json = [
        {
            "id": b.id,
            "campaign_id": b.campaign_id,
            "original_filename": b.original_filename,
            "stored_path": b.stored_path,
            "file_size_bytes": b.file_size_bytes,
            "file_format": b.file_format,
            "detected_template": b.detected_template,
            "import_mode": b.import_mode,
            "validation_status": b.validation_status,
            "detected_records": b.detected_records,
            "imported_records": b.imported_records,
            "updated_records": b.updated_records,
            "skipped_records": b.skipped_records,
            "rejected_records": b.rejected_records,
            "uploaded_by_user_id": b.uploaded_by_user_id,
            "uploaded_by_name": b.uploaded_by_name,
            "uploaded_at": b.uploaded_at.isoformat() + "Z",
            "confirmed_at": b.confirmed_at.isoformat() + "Z" if b.confirmed_at else None,
            "status": b.status,
            "rolled_back_at": b.rolled_back_at.isoformat() + "Z" if b.rolled_back_at else None,
            "rolled_back_by_name": b.rolled_back_by_name,
            "notes": b.notes,
            "stored_file_id": b.stored_file_id,
        }
        for b in db.query(ImportBatch).order_by(ImportBatch.id.asc()).all()
    ]
    reports_json = [
        {
            "id": r.id,
            "campaign_id": r.campaign_id,
            "import_batch_id": r.import_batch_id,
            "serial_no": r.serial_no,
            "raw_region": r.raw_region,
            "raw_zone": r.raw_zone,
            "raw_woreda": r.raw_woreda,
            "canonical_region": r.canonical_region,
            "canonical_zone": r.canonical_zone,
            "canonical_woreda": r.canonical_woreda,
            "campaign_day_label": r.campaign_day_label,
            "campaign_day_num": r.campaign_day_num,
            "report_date": r.report_date,
            "total_planned_target": r.total_planned_target,
            "daily_target": r.daily_target,
            "vacc_0_11_before": r.vacc_0_11_before,
            "vacc_0_11_not_before": r.vacc_0_11_not_before,
            "vacc_12_59_before": r.vacc_12_59_before,
            "vacc_12_59_not_before": r.vacc_12_59_not_before,
            "vacc_60_120_before": r.vacc_60_120_before,
            "vacc_60_120_not_before": r.vacc_60_120_not_before,
            "total_vaccinated_0_59": r.total_vaccinated_0_59,
            "daily_covered_pct": r.daily_covered_pct,
            "covered_from_total_pct": r.covered_from_total_pct,
            "nopv2_vials_received": r.nopv2_vials_received,
            "nopv2_vials_used": r.nopv2_vials_used,
            "nopv2_vials_partially_used": r.nopv2_vials_partially_used,
            "nopv2_vials_returned_unused_good": r.nopv2_vials_returned_unused_good,
            "nopv2_vials_broken": r.nopv2_vials_broken,
            "nopv2_vials_returned_bad": r.nopv2_vials_returned_bad,
            "nopv2_vials_lost": r.nopv2_vials_lost,
            "nopv2_wastage_rate_pct": r.nopv2_wastage_rate_pct,
            "bopv_vials_received": r.bopv_vials_received,
            "bopv_vials_used": r.bopv_vials_used,
            "bopv_vials_partially_used": r.bopv_vials_partially_used,
            "bopv_vials_returned_unused_good": r.bopv_vials_returned_unused_good,
            "bopv_vials_broken": r.bopv_vials_broken,
            "bopv_vials_returned_bad": r.bopv_vials_returned_bad,
            "bopv_vials_lost": r.bopv_vials_lost,
            "bopv_wastage_rate_pct": r.bopv_wastage_rate_pct,
            "afp_alerts_count": r.afp_alerts_count,
            "aefi_alerts_count": r.aefi_alerts_count,
            "sm_hhs_visited": r.sm_hhs_visited,
            "sm_group_discussions": r.sm_group_discussions,
            "sm_ipc_reached": r.sm_ipc_reached,
            "zd_identified_linked": r.zd_identified_linked,
            "zd_vaccinated": r.zd_vaccinated,
            "uv_identified_linked": r.uv_identified_linked,
            "uv_vaccinated": r.uv_vaccinated,
            "teams_total": r.teams_total,
            "teams_reported": r.teams_reported,
            "remarks": r.remarks,
            "has_reported_activity": 1 if r.has_reported_activity else 0,
            "source_submitted_at": r.source_submitted_at,
            "uploaded_at": r.uploaded_at.isoformat() + "Z",
            "version": r.version,
            "is_active": 1 if r.is_active else 0,
            "superseded_by_import_id": r.superseded_by_import_id,
        }
        for r in db.query(CampaignDailyReport).order_by(CampaignDailyReport.id.asc()).all()
    ]
    alerts_json = [
        {
            "id": a.id,
            "campaign_id": a.campaign_id,
            "report_id": a.report_id,
            "alert_type": a.alert_type,
            "canonical_zone": a.canonical_zone,
            "canonical_woreda": a.canonical_woreda,
            "campaign_day_num": a.campaign_day_num,
            "report_date": a.report_date,
            "administrative_alert_count": a.administrative_alert_count,
            "verified_clinical_cases": a.verified_clinical_cases,
            "clinical_status": a.clinical_status,
            "source_remarks": a.source_remarks,
            "follow_up_notes": a.follow_up_notes,
            "assigned_investigator": a.assigned_investigator,
            "updated_by_name": a.updated_by_name,
            "is_active": 1 if a.is_active else 0,
            "created_at": a.created_at.isoformat() + "Z",
            "updated_at": a.updated_at.isoformat() + "Z",
        }
        for a in db.query(SurveillanceAlert).order_by(SurveillanceAlert.id.asc()).all()
    ]
    geo_json = [
        {
            "id": g.id,
            "level": g.level,
            "name_field": g.name_field,
            "feature_count": g.feature_count,
            "geojson_text": g.geojson_text,
            "uploaded_by_name": g.uploaded_by_name,
            "uploaded_at": g.uploaded_at.isoformat() + "Z",
        }
        for g in db.query(GeoBoundary).order_by(GeoBoundary.id.asc()).all()
    ]
    stored_files_rows = db.query(StoredFile).order_by(StoredFile.id.asc()).all()
    stored_files_json = [
        {
            "id": f.id,
            "file_uuid": f.file_uuid,
            "original_filename": f.original_filename,
            "stored_filename": f.stored_filename,
            "extension": f.extension,
            "mime_type": f.mime_type,
            "file_size_bytes": f.file_size_bytes,
            "sha256_checksum": f.sha256_checksum,
            "module": f.module,
            "category": f.category,
            "associated_record_type": f.associated_record_type,
            "associated_record_id": f.associated_record_id,
            "description": f.description,
            "relative_path": f.relative_path,
            "storage_path": f.storage_path,
            "uploaded_by_user_id": f.uploaded_by_user_id,
            "uploaded_by_name": f.uploaded_by_name,
            "uploaded_at": f.uploaded_at.isoformat() + "Z",
            "is_active": 1 if f.is_active else 0,
        }
        for f in stored_files_rows
    ]
    preview_links_json = [
        {
            "id": p.id,
            "file_id": p.file_id,
            "token_id": p.token_id,
            "signature_hmac": p.signature_hmac,
            "expires_at": p.expires_at.isoformat() + "Z",
            "is_revoked": 1 if p.is_revoked else 0,
            "revoked_at": p.revoked_at.isoformat() + "Z" if p.revoked_at else None,
            "revoked_by_user_id": p.revoked_by_user_id,
            "revoked_by_name": p.revoked_by_name,
            "revoke_reason": p.revoke_reason,
            "created_by_user_id": p.created_by_user_id,
            "created_by_name": p.created_by_name,
            "created_at": p.created_at.isoformat() + "Z",
            "last_accessed_at": p.last_accessed_at.isoformat() + "Z" if p.last_accessed_at else None,
            "access_count": p.access_count,
        }
        for p in db.query(FilePreviewLink).order_by(FilePreviewLink.id.asc()).all()
    ]

    branding_files_count = 0
    vault_files_count = 0

    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data/system_settings.json", json.dumps(settings_rows, indent=2))
        zf.writestr("data/branding_assets.json", json.dumps(branding_json, indent=2))
        zf.writestr("data/campaigns.json", json.dumps(campaigns_json, indent=2))
        zf.writestr("data/admin_locations.json", json.dumps(locations_json, indent=2))
        zf.writestr("data/import_batches.json", json.dumps(batches_json, indent=2))
        zf.writestr("data/campaign_daily_reports.json", json.dumps(reports_json, indent=2))
        zf.writestr("data/surveillance_alerts.json", json.dumps(alerts_json, indent=2))
        zf.writestr("data/geo_boundaries.json", json.dumps(geo_json, indent=2))
        zf.writestr("data/stored_files.json", json.dumps(stored_files_json, indent=2))
        zf.writestr("data/file_preview_links.json", json.dumps(preview_links_json, indent=2))

        for b in branding_rows:
            stored_name = os.path.basename(b.stored_filename or "")
            if not stored_name:
                continue
            cand = os.path.join(branding_root, stored_name)
            src = cand if os.path.exists(cand) else (b.stored_path if b.stored_path and os.path.exists(b.stored_path) else None)
            if src:
                with open(src, "rb") as f:
                    raw = f.read()
                rel = f"files/branding/{stored_name}"
                zf.writestr(rel, raw)
                file_checksums[rel] = _sha256(raw)
                branding_files_count += 1

        for sf in stored_files_rows:
            rel_path = (sf.relative_path or "").replace("\\", "/").lstrip("/")
            if not rel_path:
                continue
            src = None
            try:
                cand = _safe_resolve_under(upload_root, rel_path)
                if os.path.exists(cand):
                    src = cand
            except ValueError:
                src = None
            if not src and sf.storage_path and os.path.exists(sf.storage_path):
                src = sf.storage_path
            if src:
                with open(src, "rb") as f:
                    raw = f.read()
                rel = f"files/vault/{rel_path}"
                zf.writestr(rel, raw)
                file_checksums[rel] = _sha256(raw)
                vault_files_count += 1

        created_at = datetime.utcnow().isoformat() + "Z"
        counts = {
            "settings": len(settings_rows),
            "brandingAssets": len(branding_json),
            "brandingFiles": branding_files_count,
            "storedFiles": vault_files_count,
            "dailyReports": len(reports_json),
            "importBatches": len(batches_json),
        }
        manifest = {
            "format": "ohb-opcms-backup-v1",
            "sourceEngine": "postgres",
            "createdAt": created_at,
            "createdByName": user.full_name,
            "counts": counts,
            "fileChecksums": file_checksums,
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

    raw_zip = buf.getvalue()
    stamp = created_at.replace(":", "-").replace(".", "-")[:19]
    filename = f"ohb-opcms-backup-{stamp}-{uuid.uuid4().hex[:6]}.zip"
    target = _safe_resolve_under(backups_dir, filename)
    with open(target, "wb") as f:
        f.write(raw_zip)

    return {
        "filename": filename,
        "fileSizeBytes": len(raw_zip),
        "sha256Checksum": _sha256(raw_zip),
        "createdAt": created_at,
        "createdByName": user.full_name,
        "sourceEngine": "postgres",
        "counts": counts,
    }


def list_backup_archives(backups_dir: str) -> List[Dict[str, Any]]:
    os.makedirs(backups_dir, exist_ok=True)
    items: List[Dict[str, Any]] = []
    for name in os.listdir(backups_dir):
        if not name.endswith(".zip"):
            continue
        full_path = _safe_resolve_under(backups_dir, name)
        try:
            with open(full_path, "rb") as f:
                raw = f.read()
            with zipfile.ZipFile(io.BytesIO(raw), "r") as zf:
                if "manifest.json" not in zf.namelist():
                    continue
                manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            items.append(
                {
                    "filename": name,
                    "fileSizeBytes": len(raw),
                    "sha256Checksum": _sha256(raw),
                    "createdAt": manifest.get("createdAt")
                    or datetime.utcfromtimestamp(os.path.getmtime(full_path)).isoformat() + "Z",
                    "createdByName": manifest.get("createdByName", "System Administrator"),
                    "sourceEngine": manifest.get("sourceEngine", "postgres"),
                    "counts": manifest.get(
                        "counts",
                        {
                            "settings": 0,
                            "brandingAssets": 0,
                            "brandingFiles": 0,
                            "storedFiles": 0,
                            "dailyReports": 0,
                            "importBatches": 0,
                        },
                    ),
                }
            )
        except Exception:
            continue
    items.sort(key=lambda x: x["createdAt"], reverse=True)
    return items


def get_backup_archive_path(backups_dir: str, filename: str) -> str:
    safe_name = os.path.basename(filename or "")
    if not safe_name.endswith(".zip"):
        raise ValueError("Invalid backup archive filename.")
    target = _safe_resolve_under(backups_dir, safe_name)
    if not os.path.exists(target):
        raise FileNotFoundError("Backup archive not found on server.")
    return target


def restore_application_backup(
    db: Session,
    zip_bytes: bytes,
    upload_root: str,
    branding_root: str,
    restore_scope: str = "full",
) -> Dict[str, Any]:
    scope = "branding_and_settings" if restore_scope == "branding_and_settings" else "full"
    os.makedirs(branding_root, exist_ok=True)
    os.makedirs(upload_root, exist_ok=True)

    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        if "manifest.json" not in zf.namelist():
            raise ValueError("Invalid backup archive: manifest.json is missing.")
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        if manifest.get("format") != "ohb-opcms-backup-v1":
            raise ValueError(f"Unsupported backup format: {manifest.get('format')}")

        for rel, expected_hash in (manifest.get("fileChecksums") or {}).items():
            if rel not in zf.namelist():
                raise ValueError(f"Backup integrity error: missing embedded file {rel}.")
            data = zf.read(rel)
            if _sha256(data) != expected_hash:
                raise ValueError(f"Backup integrity error: SHA-256 mismatch on {rel}.")

        def _read_json(path_in_zip: str) -> List[Dict[str, Any]]:
            if path_in_zip not in zf.namelist():
                return []
            return json.loads(zf.read(path_in_zip).decode("utf-8"))

        settings_rows = _read_json("data/system_settings.json")
        branding_rows = _read_json("data/branding_assets.json")

        restored_branding_files = 0
        for b in branding_rows:
            sname = os.path.basename(str(b.get("stored_filename") or ""))
            if not sname:
                continue
            rel = f"files/branding/{sname}"
            if rel in zf.namelist():
                target = _safe_resolve_under(branding_root, sname)
                with open(target, "wb") as f:
                    f.write(zf.read(rel))
                restored_branding_files += 1

        restored_vault_files = 0
        stored_files_rows = _read_json("data/stored_files.json") if scope == "full" else []
        if scope == "full":
            for sf in stored_files_rows:
                rel_path = str(sf.get("relative_path") or "").replace("\\", "/").lstrip("/")
                if not rel_path:
                    continue
                archive_rel = f"files/vault/{rel_path}"
                if archive_rel in zf.namelist():
                    target = _safe_resolve_under(upload_root, rel_path)
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with open(target, "wb") as f:
                        f.write(zf.read(archive_rel))
                    restored_vault_files += 1

        # Restore settings & branding metadata
        db.query(SystemSetting).delete()
        for k, v in DEFAULT_SYSTEM_SETTINGS_MAP.items():
            db.add(SystemSetting(key=k, value=v, updated_at=datetime.utcnow()))
        db.flush()

        for row in settings_rows:
            k = str(row.get("key") or "")
            if not k:
                continue
            existing = db.query(SystemSetting).filter(SystemSetting.key == k).first()
            if existing:
                existing.value = str(row.get("value") or "")
                existing.updated_at = _parse_dt(row.get("updated_at"))
            else:
                db.add(
                    SystemSetting(
                        key=k,
                        value=str(row.get("value") or ""),
                        updated_at=_parse_dt(row.get("updated_at")),
                    )
                )

        db.query(BrandingAsset).delete()
        db.flush()
        for b in branding_rows:
            sname = os.path.basename(str(b.get("stored_filename") or ""))
            db.add(
                BrandingAsset(
                    id=int(b["id"]) if b.get("id") else None,
                    asset_type=str(b.get("asset_type") or "logo"),
                    original_filename=str(b.get("original_filename") or sname),
                    stored_filename=sname,
                    stored_path=_safe_resolve_under(branding_root, sname),
                    mime_type=str(b.get("mime_type") or "image/png"),
                    file_size_bytes=int(b.get("file_size_bytes") or 0),
                    sha256_checksum=b.get("sha256_checksum"),
                    width=int(b["width"]) if b.get("width") is not None else None,
                    height=int(b["height"]) if b.get("height") is not None else None,
                    is_active=bool(b.get("is_active")),
                    uploaded_by_user_id=_resolve_existing_user_id(db, b.get("uploaded_by_user_id")),
                    uploaded_by_name=str(b.get("uploaded_by_name") or "System Administrator"),
                    uploaded_at=_parse_dt(b.get("uploaded_at")),
                )
            )
        db.flush()
        _sync_pg_sequence(db, "branding_assets")

        restored_reports = 0
        if scope == "full":
            db.query(FilePreviewLink).delete()
            db.query(SurveillanceAlert).delete()
            db.query(CampaignDailyReport).delete()
            db.query(ImportBatch).delete()
            db.query(StoredFile).delete()
            db.query(GeoBoundary).delete()
            db.query(AdminLocation).delete()
            db.query(Campaign).delete()
            db.flush()

            for c in _read_json("data/campaigns.json"):
                db.add(
                    Campaign(
                        id=int(c["id"]),
                        name=c["name"],
                        round_code=c["round_code"],
                        vaccines=c.get("vaccines", "nOPV2 & bOPV2"),
                        start_date=c["start_date"],
                        end_date=c["end_date"],
                        expected_days=int(c.get("expected_days", 4)),
                        status=c.get("status", "active"),
                        created_at=_parse_dt(c.get("created_at")),
                    )
                )
            db.flush()

            for l in _read_json("data/admin_locations.json"):
                db.add(
                    AdminLocation(
                        id=int(l["id"]),
                        serial_no=l.get("serial_no"),
                        raw_region=l["raw_region"],
                        raw_zone=l["raw_zone"],
                        raw_woreda=l["raw_woreda"],
                        canonical_region=l.get("canonical_region", "Oromia"),
                        canonical_zone=l["canonical_zone"],
                        canonical_woreda=l["canonical_woreda"],
                        location_type=l.get("location_type", "Zone Woreda"),
                        planned_target=int(l.get("planned_target", 0)),
                        daily_target=int(l.get("daily_target", 0)),
                        is_active=bool(l.get("is_active", True)),
                    )
                )
            db.flush()

            for sf in stored_files_rows:
                rel_path = str(sf.get("relative_path") or "").replace("\\", "/").lstrip("/")
                db.add(
                    StoredFile(
                        id=int(sf["id"]),
                        file_uuid=sf["file_uuid"],
                        original_filename=sf["original_filename"],
                        stored_filename=sf["stored_filename"],
                        extension=sf["extension"],
                        mime_type=sf["mime_type"],
                        file_size_bytes=int(sf.get("file_size_bytes", 0)),
                        sha256_checksum=sf.get("sha256_checksum"),
                        module=sf.get("module", "documents"),
                        category=sf.get("category", "general"),
                        associated_record_type=sf.get("associated_record_type"),
                        associated_record_id=sf.get("associated_record_id"),
                        description=sf.get("description", ""),
                        relative_path=rel_path,
                        storage_path=_safe_resolve_under(upload_root, rel_path),
                        uploaded_by_user_id=_resolve_existing_user_id(db, sf.get("uploaded_by_user_id")),
                        uploaded_by_name=sf.get("uploaded_by_name", "System Administrator"),
                        uploaded_at=_parse_dt(sf.get("uploaded_at")),
                        is_active=bool(sf.get("is_active", True)),
                    )
                )
            db.flush()

            for b in _read_json("data/import_batches.json"):
                db.add(
                    ImportBatch(
                        id=int(b["id"]),
                        campaign_id=int(b["campaign_id"]),
                        original_filename=b["original_filename"],
                        stored_path=b.get("stored_path", ""),
                        file_size_bytes=int(b.get("file_size_bytes", 0)),
                        file_format=b.get("file_format", "csv"),
                        detected_template=b.get("detected_template", ""),
                        import_mode=b.get("import_mode", "incremental_update"),
                        validation_status=b.get("validation_status", "passed"),
                        detected_records=int(b.get("detected_records", 0)),
                        imported_records=int(b.get("imported_records", 0)),
                        updated_records=int(b.get("updated_records", 0)),
                        skipped_records=int(b.get("skipped_records", 0)),
                        rejected_records=int(b.get("rejected_records", 0)),
                        uploaded_by_user_id=_resolve_existing_user_id(db, b.get("uploaded_by_user_id")),
                        uploaded_by_name=b.get("uploaded_by_name", "System Administrator"),
                        uploaded_at=_parse_dt(b.get("uploaded_at")),
                        confirmed_at=_parse_dt(b["confirmed_at"]) if b.get("confirmed_at") else None,
                        status=b.get("status", "confirmed"),
                        rolled_back_at=_parse_dt(b["rolled_back_at"]) if b.get("rolled_back_at") else None,
                        rolled_back_by_name=b.get("rolled_back_by_name"),
                        notes=b.get("notes"),
                        stored_file_id=b.get("stored_file_id"),
                    )
                )
            db.flush()

            for r in _read_json("data/campaign_daily_reports.json"):
                db.add(
                    CampaignDailyReport(
                        id=int(r["id"]),
                        campaign_id=int(r["campaign_id"]),
                        import_batch_id=int(r["import_batch_id"]),
                        serial_no=r.get("serial_no"),
                        raw_region=r["raw_region"],
                        raw_zone=r["raw_zone"],
                        raw_woreda=r["raw_woreda"],
                        canonical_region=r.get("canonical_region", "Oromia"),
                        canonical_zone=r["canonical_zone"],
                        canonical_woreda=r["canonical_woreda"],
                        campaign_day_label=r["campaign_day_label"],
                        campaign_day_num=int(r["campaign_day_num"]),
                        report_date=r.get("report_date"),
                        total_planned_target=int(r.get("total_planned_target", 0)),
                        daily_target=int(r.get("daily_target", 0)),
                        vacc_0_11_before=int(r.get("vacc_0_11_before", 0)),
                        vacc_0_11_not_before=int(r.get("vacc_0_11_not_before", 0)),
                        vacc_12_59_before=int(r.get("vacc_12_59_before", 0)),
                        vacc_12_59_not_before=int(r.get("vacc_12_59_not_before", 0)),
                        vacc_60_120_before=int(r.get("vacc_60_120_before", 0)),
                        vacc_60_120_not_before=int(r.get("vacc_60_120_not_before", 0)),
                        total_vaccinated_0_59=int(r.get("total_vaccinated_0_59", 0)),
                        daily_covered_pct=float(r.get("daily_covered_pct", 0.0)),
                        covered_from_total_pct=float(r.get("covered_from_total_pct", 0.0)),
                        nopv2_vials_received=r.get("nopv2_vials_received"),
                        nopv2_vials_used=r.get("nopv2_vials_used"),
                        nopv2_vials_partially_used=r.get("nopv2_vials_partially_used"),
                        nopv2_vials_returned_unused_good=r.get("nopv2_vials_returned_unused_good"),
                        nopv2_vials_broken=r.get("nopv2_vials_broken"),
                        nopv2_vials_returned_bad=r.get("nopv2_vials_returned_bad"),
                        nopv2_vials_lost=r.get("nopv2_vials_lost"),
                        nopv2_wastage_rate_pct=r.get("nopv2_wastage_rate_pct"),
                        bopv_vials_received=r.get("bopv_vials_received"),
                        bopv_vials_used=r.get("bopv_vials_used"),
                        bopv_vials_partially_used=r.get("bopv_vials_partially_used"),
                        bopv_vials_returned_unused_good=r.get("bopv_vials_returned_unused_good"),
                        bopv_vials_broken=r.get("bopv_vials_broken"),
                        bopv_vials_returned_bad=r.get("bopv_vials_returned_bad"),
                        bopv_vials_lost=r.get("bopv_vials_lost"),
                        bopv_wastage_rate_pct=r.get("bopv_wastage_rate_pct"),
                        afp_alerts_count=int(r.get("afp_alerts_count", 0)),
                        aefi_alerts_count=int(r.get("aefi_alerts_count", 0)),
                        sm_hhs_visited=int(r.get("sm_hhs_visited", 0)),
                        sm_group_discussions=int(r.get("sm_group_discussions", 0)),
                        sm_ipc_reached=int(r.get("sm_ipc_reached", 0)),
                        zd_identified_linked=int(r.get("zd_identified_linked", 0)),
                        zd_vaccinated=int(r.get("zd_vaccinated", 0)),
                        uv_identified_linked=int(r.get("uv_identified_linked", 0)),
                        uv_vaccinated=int(r.get("uv_vaccinated", 0)),
                        teams_total=int(r.get("teams_total", 0)),
                        teams_reported=int(r.get("teams_reported", 0)),
                        remarks=r.get("remarks", ""),
                        has_reported_activity=bool(r.get("has_reported_activity", False)),
                        source_submitted_at=r.get("source_submitted_at"),
                        uploaded_at=_parse_dt(r.get("uploaded_at")),
                        version=int(r.get("version", 1)),
                        is_active=bool(r.get("is_active", True)),
                        superseded_by_import_id=r.get("superseded_by_import_id"),
                    )
                )
                restored_reports += 1
            db.flush()

            for a in _read_json("data/surveillance_alerts.json"):
                db.add(
                    SurveillanceAlert(
                        id=int(a["id"]),
                        campaign_id=int(a["campaign_id"]),
                        report_id=int(a["report_id"]),
                        alert_type=a["alert_type"],
                        canonical_zone=a["canonical_zone"],
                        canonical_woreda=a["canonical_woreda"],
                        campaign_day_num=int(a["campaign_day_num"]),
                        report_date=a.get("report_date"),
                        administrative_alert_count=int(a.get("administrative_alert_count", 0)),
                        verified_clinical_cases=int(a.get("verified_clinical_cases", 0)),
                        clinical_status=a.get("clinical_status", "reported_pending"),
                        source_remarks=a.get("source_remarks", ""),
                        follow_up_notes=a.get("follow_up_notes", ""),
                        assigned_investigator=a.get("assigned_investigator", ""),
                        updated_by_name=a.get("updated_by_name"),
                        is_active=bool(a.get("is_active", True)),
                        created_at=_parse_dt(a.get("created_at")),
                        updated_at=_parse_dt(a.get("updated_at")),
                    )
                )

            for g in _read_json("data/geo_boundaries.json"):
                db.add(
                    GeoBoundary(
                        id=int(g["id"]),
                        level=g["level"],
                        name_field=g["name_field"],
                        feature_count=int(g["feature_count"]),
                        geojson_text=g["geojson_text"],
                        uploaded_by_name=g.get("uploaded_by_name", "System Administrator"),
                        uploaded_at=_parse_dt(g.get("uploaded_at")),
                    )
                )

            for p in _read_json("data/file_preview_links.json"):
                db.add(
                    FilePreviewLink(
                        id=int(p["id"]),
                        file_id=int(p["file_id"]),
                        token_id=p["token_id"],
                        signature_hmac=p["signature_hmac"],
                        expires_at=_parse_dt(p.get("expires_at")),
                        is_revoked=bool(p.get("is_revoked", False)),
                        revoked_at=_parse_dt(p["revoked_at"]) if p.get("revoked_at") else None,
                        revoked_by_user_id=_resolve_existing_user_id(db, p.get("revoked_by_user_id")),
                        revoked_by_name=p.get("revoked_by_name"),
                        revoke_reason=p.get("revoke_reason"),
                        created_by_user_id=_resolve_existing_user_id(db, p.get("created_by_user_id")),
                        created_by_name=p.get("created_by_name", "System Administrator"),
                        created_at=_parse_dt(p.get("created_at")),
                        last_accessed_at=_parse_dt(p["last_accessed_at"]) if p.get("last_accessed_at") else None,
                        access_count=int(p.get("access_count", 0)),
                    )
                )
            db.flush()
            for tbl in (
                "campaigns",
                "admin_locations",
                "stored_files",
                "import_batches",
                "campaign_daily_reports",
                "surveillance_alerts",
                "geo_boundaries",
                "file_preview_links",
            ):
                _sync_pg_sequence(db, tbl)

        db.flush()

    return {
        "ok": True,
        "restoreScope": scope,
        "restoredSettings": len(settings_rows),
        "restoredBrandingAssets": len(branding_rows),
        "restoredBrandingFiles": restored_branding_files,
        "restoredStoredFiles": restored_vault_files,
        "restoredReports": restored_reports,
        "settings": get_system_settings(db),
        "message": (
            f"Restored {len(settings_rows)} system settings and {len(branding_rows)} branding asset record(s) ({restored_branding_files} asset file(s))."
            if scope == "branding_and_settings"
            else f"Full restore completed: {len(settings_rows)} settings, {len(branding_rows)} branding metadata ({restored_branding_files} files), {restored_reports} reports, {restored_vault_files} vault files."
        ),
    }


def perform_operational_data_reset(
    db: Session,
    clear_stored_vault_files: bool = False,
) -> Dict[str, Any]:
    """
    Safely resets ONLY operational campaign data.
    Strictly preserves branding_assets, branding files on disk, system_settings,
    users, campaigns, admin_locations, and geo_boundaries.
    """
    deleted_alerts = db.query(SurveillanceAlert).delete()
    deleted_reports = db.query(CampaignDailyReport).delete()
    deleted_batches = db.query(ImportBatch).delete()
    deleted_vault_files = 0
    if clear_stored_vault_files:
        db.query(FilePreviewLink).delete()
        deleted_vault_files = db.query(StoredFile).delete()
    db.flush()
    return {
        "ok": True,
        "deletedReports": deleted_reports,
        "deletedAlerts": deleted_alerts,
        "deletedBatches": deleted_batches,
        "deletedVaultFiles": deleted_vault_files,
        "brandingPreserved": True,
        "settingsPreserved": True,
    }
