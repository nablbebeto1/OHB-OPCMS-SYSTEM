import asyncio
import csv
import hashlib
import io
import json
import os
import re
import uuid
import zipfile
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import openpyxl
from fastapi import (
    Cookie,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import func
from sqlalchemy.orm import Session

from .analytics import (
    DEFAULT_SYSTEM_SETTINGS_MAP,
    compute_advanced_analytics,
    compute_dashboard_summary,
    get_command_room_state,
    get_system_settings,
    persist_system_settings,
)
from .backup_service import (
    create_application_backup,
    get_backup_archive_path,
    list_backup_archives,
    perform_operational_data_reset,
    restore_application_backup,
)
from .config import settings
from .database import SessionLocal, get_db
from .provision_accounts import provision_configured_accounts
from .files_service import (
    create_preview_link,
    ensure_storage_directories,
    extract_spreadsheet_preview,
    resolve_public_base_url,
    resolve_safe_storage_path,
    save_permanent_file,
    serialize_preview_link,
    serialize_stored_file,
    verify_preview_token,
)
from .models import (
    AdminLocation,
    AuditLog,
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
from .parser import parse_campaign_file

app = FastAPI(title=settings.APP_NAME, version="1.1.0")
settings.validate_security_config()
UPLOAD_ROOT = ensure_storage_directories()
BRANDING_ROOT = os.path.abspath(settings.BRANDING_UPLOAD_DIR or os.path.join(UPLOAD_ROOT, "branding"))
os.makedirs(BRANDING_ROOT, exist_ok=True)
STAGING_DIR = os.path.join(UPLOAD_ROOT, "staging")
os.makedirs(STAGING_DIR, exist_ok=True)
BACKUPS_ROOT = os.path.join(UPLOAD_ROOT, "backups")
os.makedirs(BACKUPS_ROOT, exist_ok=True)

ALL_BRANDING_ASSET_TYPES = [
    "logo",
    "app_logo",
    "command_center_logo",
    "login_logo",
    "header_logo",
    "footer_logo",
    "favicon",
    "login_background",
    "visual_asset",
]


@app.on_event("startup")
def _startup_provision_accounts() -> None:
    try:
        db = SessionLocal()
        try:
            provision_configured_accounts(db)
        finally:
            db.close()
    except Exception:
        # Avoid blocking startup if DB migrations have not yet been applied
        pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_json_handler(_request: Request, exc: HTTPException):
    msg = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "error": msg},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_json_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "error": "Invalid request payload."},
    )


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"

STAGING_STORE: Dict[str, Dict[str, Any]] = {}
SSE_SUBSCRIBERS: List[asyncio.Queue] = []

DEFAULT_FAVICON_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
    '<rect width="40" height="40" rx="8" fill="#485EA9"/>'
    '<path d="M11 21h4.5l3-7 4 12 3-5H29" fill="none" stroke="#FFFFFF" '
    'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    '<circle cx="20" cy="20" r="3" fill="#D29441"/></svg>'
)

ROLE_PERMISSIONS = {
    "system_admin": [
        "view_dashboard",
        "view_command_room",
        "upload_data",
        "confirm_import",
        "rollback_import",
        "correct_data",
        "manage_alerts",
        "export_reports",
        "manage_users",
        "view_audit_logs",
        "manage_settings",
        "manage_branding",
        "upload_geo",
        "view_files",
        "upload_files",
        "manage_preview_links",
        "delete_files",
    ],
    "command_center": [
        "view_dashboard",
        "view_command_room",
        "correct_data",
        "manage_alerts",
        "export_reports",
        "upload_geo",
        "view_files",
        "upload_files",
        "manage_preview_links",
    ],
    "central_command": [
        "view_dashboard",
        "view_command_room",
        "correct_data",
        "manage_alerts",
        "export_reports",
        "upload_geo",
        "view_files",
        "upload_files",
        "manage_preview_links",
    ],
    "zone_officer": [
        "view_dashboard",
        "view_command_room",
        "correct_data",
        "manage_alerts",
        "export_reports",
        "view_files",
        "upload_files",
    ],
    "woreda_officer": [
        "view_dashboard",
        "view_command_room",
        "export_reports",
        "view_files",
    ],
    "viewer": [
        "view_dashboard",
        "view_command_room",
        "export_reports",
        "view_files",
    ],
    "command_room_viewer": ["view_command_room"],
}


NAV_MODULE_REGISTRY = [
    {"key": "live_command_center", "label": "Live Command Center", "path": "/", "group": "operations", "requiredPermission": "view_dashboard"},
    {"key": "command_room", "label": "Command Room (5-Screen)", "path": "/command-room", "group": "operations", "requiredPermission": "view_command_room"},
    {"key": "command_center", "label": "Command Center", "path": "/command-center", "group": "operations", "requiredPermission": "view_dashboard"},
    {"key": "campaign_overview", "label": "Campaign Overview", "path": "/campaign-overview", "group": "operations", "requiredPermission": "view_dashboard"},
    {"key": "geographic_performance", "label": "Geographic Performance", "path": "/geographic-performance", "group": "analytics", "requiredPermission": "view_dashboard"},
    {"key": "daily_vaccination", "label": "Daily Vaccination", "path": "/daily-vaccination", "group": "analytics", "requiredPermission": "view_dashboard"},
    {"key": "vaccine_utilization", "label": "Vaccine Utilization", "path": "/vaccine-utilization", "group": "analytics", "requiredPermission": "view_dashboard"},
    {"key": "alerts", "label": "AFP & AEFI Alerts", "path": "/alerts", "group": "operations", "requiredPermission": "view_dashboard"},
    {"key": "social_mobilization", "label": "Social Mobilization", "path": "/social-mobilization", "group": "analytics", "requiredPermission": "view_dashboard"},
    {"key": "zero_dose", "label": "Zero Dose & Under-vacc.", "path": "/zero-dose", "group": "analytics", "requiredPermission": "view_dashboard"},
    {"key": "reporting_completeness", "label": "Reporting Completeness", "path": "/reporting-completeness", "group": "analytics", "requiredPermission": "view_dashboard"},
    {"key": "data_upload", "label": "Data Upload Center", "path": "/data-upload", "group": "admin", "requiredPermission": "upload_data"},
    {"key": "file_vault", "label": "Document & File Vault", "path": "/files", "group": "admin", "requiredPermission": "view_files"},
    {"key": "reports_analytics", "label": "Reports & Analytics", "path": "/reports-analytics", "group": "analytics", "requiredPermission": "export_reports"},
    {"key": "user_management", "label": "User Management", "path": "/user-management", "group": "admin", "requiredPermission": "manage_users"},
    {"key": "system_settings", "label": "System Settings", "path": "/system-settings", "group": "admin", "requiredPermission": "manage_settings"},
    {"key": "branding_appearance", "label": "Branding & Appearance", "path": "/branding", "group": "admin", "requiredPermission": "manage_branding"},
]


def serialize_user(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "fullName": user.full_name,
        "email": user.email,
        "role": user.role,
        "assignedZone": user.assigned_zone,
        "assignedWoreda": user.assigned_woreda,
        "isActive": bool(user.is_active),
        "mustChangePassword": bool(getattr(user, "must_change_password", False)),
        "createdAt": user.created_at.isoformat() + "Z" if user.created_at else "",
        "lastLoginAt": user.last_login_at.isoformat() + "Z" if user.last_login_at else None,
    }


def build_auth_context(user: Optional[User], db: Session) -> Dict[str, Any]:
    cfg = get_system_settings(db)
    guest_enabled = bool(cfg.get("guestPublicOverviewEnabled", False))
    if not user:
        return {
            "authenticated": False,
            "user": {
                "id": 0,
                "username": "guest",
                "fullName": "Guest Visitor",
                "email": "",
                "role": "viewer",
                "assignedZone": None,
                "assignedWoreda": None,
                "isActive": True,
                "mustChangePassword": False,
                "createdAt": "",
                "lastLoginAt": None,
            },
            "permissions": ["view_public_overview"] if guest_enabled else [],
            "navigation": [],
            "defaultLanding": "public_overview" if guest_enabled else "login",
            "guestPublicOverviewEnabled": guest_enabled,
        }

    perms = ROLE_PERMISSIONS.get(user.role, [])
    perms_set = set(perms)
    disabled_set = set(cfg.get("disabledModules") or [])
    if bool(getattr(user, "must_change_password", False)):
        navigation = []
        default_landing = "change_password"
    elif user.role == "command_room_viewer":
        navigation = []
        default_landing = "command_room"
    else:
        navigation = [
            item
            for item in NAV_MODULE_REGISTRY
            if item["requiredPermission"] in perms_set and item["key"] not in disabled_set
        ]
        nav_keys = {n["key"] for n in navigation}
        pref_landing = cfg.get("defaultLandingPage", "live_command_center")
        if pref_landing in nav_keys:
            default_landing = pref_landing
        elif "live_command_center" in nav_keys:
            default_landing = "live_command_center"
        else:
            default_landing = navigation[0]["key"] if navigation else "live_command_center"

    return {
        "authenticated": True,
        "user": serialize_user(user),
        "permissions": perms,
        "navigation": navigation,
        "defaultLanding": default_landing,
        "guestPublicOverviewEnabled": guest_enabled,
    }


def record_audit(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: Any,
    details: str,
    user: Optional[User] = None,
    ip_address: str = "127.0.0.1",
) -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            username=user.username if user else "anonymous",
            user_role=user.role if user else "viewer",
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            details=details,
            ip_address=ip_address,
        )
    )


async def broadcast_sse(event_type: str, actor: str, message: str) -> None:
    payload = json.dumps(
        {
            "type": event_type,
            "actor": actor,
            "message": message,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
    )
    for q in list(SSE_SUBSCRIBERS):
        await q.put(f"event: {event_type}\ndata: {payload}\n\n")


def get_optional_user(
    authorization: Optional[str] = Header(default=None),
    opcms_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    token: Optional[str] = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif opcms_token:
        token = opcms_token.strip()
    if not token:
        return None
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(claims.get("sub", 0))
        token_version = int(claims.get("tv", -1))
    except (JWTError, ValueError, TypeError):
        return None
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        return None
    current_tv = int(getattr(user, "token_version", 1) or 1)
    if token_version != current_tv:
        return None
    return user


def require_session_only(user: Optional[User] = Depends(get_optional_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_authenticated(user: User = Depends(require_session_only)) -> User:
    if bool(getattr(user, "must_change_password", False)):
        raise HTTPException(
            status_code=403,
            detail="Password update required. Please change your initial password before accessing protected resources.",
        )
    return user


def require_perm(permission: str):
    def _dep(user: User = Depends(require_authenticated)) -> User:
        perms = set(ROLE_PERMISSIONS.get(user.role, []))
        if permission not in perms:
            raise HTTPException(
                status_code=403,
                detail=f'Access denied for role "{user.role}". Required permission: {permission}.',
            )
        return user

    return _dep


def require_dashboard_access(user: User = Depends(require_perm("view_dashboard"))) -> User:
    return user


def require_upload_access(user: User = Depends(require_perm("upload_data"))) -> User:
    return user


def require_admin_access(user: User = Depends(require_perm("manage_branding"))) -> User:
    return user


# ---------- Health & Public Overview ----------
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "ohb-opcms-fastapi",
        "uploadRootConfigured": os.path.isdir(UPLOAD_ROOT),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.get("/api/public/overview")
def public_overview(
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    cfg = get_system_settings(db)
    if not cfg["guestPublicOverviewEnabled"] and not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Public overview is currently disabled by System Administrator.",
        )
    camp = db.query(Campaign).order_by(Campaign.id.asc()).first()
    summary = compute_dashboard_summary(db, campaign_id=camp.id if camp else 1)
    return {
        "campaignName": camp.name if camp else "Oromia Region – Polio SIA Campaign",
        "roundCode": camp.round_code if camp else "R1-NOV-2026",
        "totalPlannedTarget": summary["kpis"]["totalPlannedTarget"],
        "totalChildrenVaccinated0_59": summary["kpis"]["totalChildrenVaccinated0_59"],
        "overallVaccinationCoveragePct": summary["kpis"]["overallVaccinationCoveragePct"],
        "expectedReportingWoredas": summary["kpis"]["expectedReportingWoredas"],
        "submittedWoredas": summary["kpis"]["submittedWoredas"],
        "serverTimestamp": summary["serverTimestamp"],
    }


# ---------- Branding ----------
def _asset_endpoint_url(asset_type: str, asset_id: int) -> str:
    if asset_type == "logo":
        return f"/api/branding/logo?v={asset_id}"
    if asset_type == "favicon":
        return f"/api/branding/favicon?v={asset_id}"
    return f"/api/branding/asset/{asset_type}?v={asset_id}"


def _branding_meta(row: Optional[BrandingAsset]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {
        "id": row.id,
        "assetType": row.asset_type,
        "originalFilename": row.original_filename,
        "storedFilename": row.stored_filename,
        "mimeType": row.mime_type,
        "fileSizeBytes": row.file_size_bytes,
        "sha256Checksum": getattr(row, "sha256_checksum", None),
        "width": row.width,
        "height": row.height,
        "isActive": bool(row.is_active),
        "uploadedByName": row.uploaded_by_name,
        "uploadedAt": row.uploaded_at.isoformat() + "Z",
    }


@app.get("/api/branding")
def get_branding(
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    active_rows = (
        db.query(BrandingAsset)
        .filter(BrandingAsset.is_active == True)
        .order_by(BrandingAsset.id.desc())
        .all()
    )
    by_type: Dict[str, BrandingAsset] = {}
    for row in active_rows:
        if row.asset_type not in by_type:
            by_type[row.asset_type] = row

    assets_map: Dict[str, Any] = {}
    for t in ALL_BRANDING_ASSET_TYPES:
        rec = by_type.get(t)
        assets_map[t] = {
            "url": _asset_endpoint_url(t, rec.id) if rec else None,
            "hasCustom": rec is not None,
            "meta": _branding_meta(rec),
        }

    logo = by_type.get("logo")
    favicon = by_type.get("favicon")
    cfg = get_system_settings(db)

    payload: Dict[str, Any] = {
        "logoUrl": f"/api/branding/logo?v={logo.id}" if logo else None,
        "faviconUrl": f"/api/branding/favicon?v={favicon.id}" if favicon else None,
        "hasCustomLogo": logo is not None,
        "hasCustomFavicon": favicon is not None,
        "logoMeta": _branding_meta(logo),
        "faviconMeta": _branding_meta(favicon),
        "assets": assets_map,
        "identity": {
            "appName": cfg["appName"],
            "appShortName": cfg["appShortName"],
            "organizationName": cfg["organizationName"],
            "appTagline": cfg["appTagline"],
            "footerText": cfg["footerText"],
            "showFooterBranding": cfg["showFooterBranding"],
            "defaultLanguage": cfg["defaultLanguage"],
        },
        "theme": {
            "primaryColor": cfg["primaryColor"],
            "secondaryColor": cfg["secondaryColor"],
            "accentColor": cfg["accentColor"],
            "surfaceColor": cfg["surfaceColor"],
            "displayFont": cfg["displayFont"],
            "bodyFont": cfg["bodyFont"],
            "fontScale": cfg["fontScale"],
            "loginTheme": cfg["loginTheme"],
        },
        "updatedAt": (
            logo.uploaded_at
            if logo
            else favicon.uploaded_at
            if favicon
            else active_rows[0].uploaded_at
            if active_rows
            else datetime.utcnow()
        ).isoformat()
        + "Z",
    }
    if user and user.role == "system_admin":
        hist = db.query(BrandingAsset).order_by(BrandingAsset.id.desc()).limit(50).all()
        payload["history"] = [_branding_meta(h) for h in hist]
    return payload


def _serve_branding_asset_row(asset_type: str, db: Session):
    rec = (
        db.query(BrandingAsset)
        .filter(BrandingAsset.asset_type == asset_type, BrandingAsset.is_active == True)
        .order_by(BrandingAsset.id.desc())
        .first()
    )
    if not rec:
        return None
    cand = os.path.join(BRANDING_ROOT, os.path.basename(rec.stored_filename))
    path_to_serve = cand if os.path.exists(cand) else rec.stored_path
    if not path_to_serve or not os.path.exists(path_to_serve):
        return None
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600"}
    if rec.mime_type == "image/svg+xml":
        headers["Content-Security-Policy"] = "sandbox"
    return FileResponse(path_to_serve, media_type=rec.mime_type, headers=headers)


@app.get("/api/branding/logo")
def serve_logo(db: Session = Depends(get_db)):
    resp = _serve_branding_asset_row("logo", db)
    if not resp:
        raise HTTPException(status_code=404, detail="No custom logo configured")
    return resp


@app.get("/api/branding/favicon")
def serve_favicon(db: Session = Depends(get_db)):
    resp = _serve_branding_asset_row("favicon", db)
    if not resp:
        return Response(content=DEFAULT_FAVICON_SVG, media_type="image/svg+xml")
    return resp


@app.get("/api/branding/asset/{asset_type}")
def serve_named_branding_asset(asset_type: str, db: Session = Depends(get_db)):
    if asset_type not in ALL_BRANDING_ASSET_TYPES:
        raise HTTPException(status_code=404, detail="Unknown branding asset type")
    if asset_type == "favicon":
        return serve_favicon(db)
    resp = _serve_branding_asset_row(asset_type, db)
    if not resp:
        raise HTTPException(status_code=404, detail=f"No active {asset_type} configured")
    return resp


@app.post("/api/admin/branding/reset")
async def reset_all_branding(
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    if (payload.get("confirmationText") or "").strip() != "RESET BRANDING":
        raise HTTPException(
            status_code=400,
            detail='Type "RESET BRANDING" to explicitly confirm resetting all active branding assets and appearance settings.',
        )
    db.query(BrandingAsset).filter(BrandingAsset.is_active == True).update({"is_active": False})
    persist_system_settings(
        db,
        {
            k: DEFAULT_SYSTEM_SETTINGS_MAP[k]
            for k in (
                "appName",
                "appShortName",
                "organizationName",
                "appTagline",
                "footerText",
                "primaryColor",
                "secondaryColor",
                "accentColor",
                "surfaceColor",
                "displayFont",
                "bodyFont",
                "fontScale",
                "loginTheme",
                "showFooterBranding",
            )
        },
    )
    record_audit(
        db,
        "BRANDING_EXPLICIT_RESET",
        "branding_asset",
        "all",
        "Administrator explicitly reset active branding assets & appearance settings to institutional defaults.",
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("branding:updated", current_user.full_name, "Branding & appearance reset to defaults")
    await broadcast_sse("settings:updated", current_user.full_name, "Appearance settings reset to defaults")
    return get_branding(user=current_user, db=db)


@app.post("/api/admin/branding/{asset_type}")
async def upload_branding_asset(
    asset_type: str,
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    if asset_type not in ALL_BRANDING_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset type")
    content = await file.read()
    ext = os.path.splitext(os.path.basename(file.filename or ""))[1].lower()
    allowed_exts = {".ico", ".png", ".svg"} if asset_type == "favicon" else {".png", ".jpg", ".jpeg", ".svg", ".webp"}
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported {asset_type} format")
    max_bytes = (
        2 * 1024 * 1024
        if asset_type == "favicon"
        else 10 * 1024 * 1024
        if asset_type in ("login_background", "visual_asset")
        else 5 * 1024 * 1024
    )
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail="File exceeds maximum size")
    if ext == ".svg":
        text_svg = content.decode("utf-8", errors="ignore")
        if re.search(r"<script|<foreignObject|javascript:|on[a-z]+\s*=", text_svg, re.I):
            raise HTTPException(status_code=400, detail="Unsafe SVG content rejected")

    sha256_hex = hashlib.sha256(content).hexdigest()
    unique_name = f"{asset_type}_{uuid.uuid4().hex[:12]}{ext}"
    os.makedirs(BRANDING_ROOT, exist_ok=True)
    stored_path = os.path.abspath(os.path.join(BRANDING_ROOT, unique_name))
    with open(stored_path, "wb") as f:
        f.write(content)

    db.query(BrandingAsset).filter(
        BrandingAsset.asset_type == asset_type, BrandingAsset.is_active == True
    ).update({"is_active": False})
    rec = BrandingAsset(
        asset_type=asset_type,
        original_filename=os.path.basename(file.filename or unique_name),
        stored_filename=unique_name,
        stored_path=stored_path,
        mime_type=file.content_type or "application/octet-stream",
        file_size_bytes=len(content),
        sha256_checksum=sha256_hex,
        is_active=True,
        uploaded_by_user_id=current_user.id,
        uploaded_by_name=current_user.full_name,
    )
    db.add(rec)
    db.flush()
    record_audit(
        db,
        f"BRANDING_{asset_type.upper()}_UPDATED",
        "branding_asset",
        rec.id,
        f'Uploaded {asset_type} "{rec.original_filename}" (sha256={sha256_hex[:12]}).',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("branding:updated", current_user.full_name, f"Updated system {asset_type}")
    return get_branding(user=current_user, db=db)


@app.delete("/api/admin/branding/{asset_type}")
async def delete_branding_asset(
    asset_type: str,
    request: Request,
    current_user: User = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    if asset_type not in ALL_BRANDING_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset type")
    db.query(BrandingAsset).filter(
        BrandingAsset.asset_type == asset_type, BrandingAsset.is_active == True
    ).update({"is_active": False})
    record_audit(
        db,
        f"BRANDING_{asset_type.upper()}_REMOVED",
        "branding_asset",
        asset_type,
        f"Deactivated active {asset_type} (retained archived asset for recovery).",
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("branding:updated", current_user.full_name, f"Removed system {asset_type}")
    return get_branding(user=current_user, db=db)


@app.post("/api/admin/branding/restore/{asset_id}")
async def restore_branding_asset(
    asset_id: int,
    request: Request,
    current_user: User = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    rec = db.query(BrandingAsset).filter(BrandingAsset.id == asset_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Historical branding asset not found.")
    cand = os.path.join(BRANDING_ROOT, os.path.basename(rec.stored_filename))
    if not os.path.exists(cand) and not os.path.exists(rec.stored_path):
        raise HTTPException(status_code=404, detail="Historical branding file is missing from server storage.")
    db.query(BrandingAsset).filter(BrandingAsset.asset_type == rec.asset_type).update({"is_active": False})
    rec.is_active = True
    record_audit(
        db,
        "BRANDING_ASSET_RESTORED",
        "branding_asset",
        rec.id,
        f'Restored {rec.asset_type} "{rec.original_filename}".',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("branding:updated", current_user.full_name, f"Restored previous {rec.asset_type}")
    return get_branding(user=current_user, db=db)


# ---------- SSE Events ----------
@app.get("/api/events")
async def sse_events(current_user: User = Depends(require_perm("view_command_room"))):
    q: asyncio.Queue = asyncio.Queue()
    SSE_SUBSCRIBERS.append(q)

    async def stream():
        try:
            yield f"event: connected\ndata: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                msg = await q.get()
                yield msg
        finally:
            if q in SSE_SUBSCRIBERS:
                SSE_SUBSCRIBERS.remove(q)

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------- Authentication ----------
@app.get("/api/auth/me")
def auth_me(
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return build_auth_context(user, db)


@app.post("/api/auth/login")
def login(
    payload: Dict[str, str],
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username/email and password are required.")

    user = (
        db.query(User)
        .filter(
            (func.lower(User.username) == username.lower())
            | (func.lower(User.email) == username.lower())
        )
        .first()
    )
    if not user or not user.is_active or not pwd_context.verify(password, user.password_hash):
        record_audit(
            db,
            "LOGIN_FAILED",
            "user",
            username or "unknown",
            f'Failed login attempt for "{username}".',
            ip_address=request.client.host if request.client else "127.0.0.1",
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    user.last_login_at = datetime.utcnow()
    record_audit(
        db,
        "LOGIN_SUCCESS",
        "user",
        user.id,
        f'User "{user.username}" ({user.role}) signed in.',
        user=user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()

    token_version = int(getattr(user, "token_version", 1) or 1)
    token = jwt.encode(
        {
            "sub": str(user.id),
            "role": user.role,
            "tv": token_version,
            "exp": datetime.utcnow() + timedelta(days=7),
        },
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )

    response.set_cookie(
        key="opcms_token",
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 24 * 7,
    )

    ctx = build_auth_context(user, db)
    return {"token": token, **ctx}


@app.post("/api/auth/logout")
def logout(
    response: Response,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    if user:
        user.token_version = int(getattr(user, "token_version", 1) or 1) + 1
        record_audit(
            db,
            "LOGOUT",
            "user",
            user.id,
            f'User "{user.username}" signed out and session tokens invalidated.',
            user=user,
            ip_address=request.client.host if request.client else "127.0.0.1",
        )
        db.commit()
    response.delete_cookie(key="opcms_token", path="/")
    return {"ok": True}


@app.post("/api/auth/change-password")
def change_password(
    payload: Dict[str, str],
    response: Response,
    request: Request,
    current_user: User = Depends(require_session_only),
    db: Session = Depends(get_db),
):
    current_password = payload.get("currentPassword") or ""
    new_password = payload.get("newPassword") or ""
    if not current_password or not new_password:
        raise HTTPException(
            status_code=400,
            detail="Current password and new password are required.",
        )

    if (
        len(new_password) < 12
        or not re.search(r"[A-Za-z]", new_password)
        or not re.search(r"[0-9!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]", new_password)
    ):
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 12 characters and include letters plus numbers or symbols.",
        )

    if not pwd_context.verify(current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    if current_password == new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from your current password.",
        )

    current_user.password_hash = pwd_context.hash(new_password)
    current_user.must_change_password = False
    current_user.token_version = int(getattr(current_user, "token_version", 1) or 1) + 1
    record_audit(
        db,
        "PASSWORD_CHANGED",
        "user",
        current_user.id,
        f'User "{current_user.username}" changed password and invalidated prior tokens.',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    response.delete_cookie(key="opcms_token", path="/")
    return {
        "ok": True,
        "requiresRelogin": True,
        "message": "Password changed successfully. Please sign in again with your new password.",
    }


# ---------- Permanent File Storage & 6-Day Secure Live Preview Links ----------
@app.get("/api/files")
def list_stored_files(
    request: Request,
    module: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(require_perm("view_files")),
    db: Session = Depends(get_db),
):
    q = db.query(StoredFile).filter(StoredFile.is_active == True)
    if module and module != "all":
        q = q.filter(StoredFile.module == module)
    if category and category != "all":
        q = q.filter(StoredFile.category == category)
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            (StoredFile.original_filename.ilike(like))
            | (StoredFile.description.ilike(like))
            | (StoredFile.uploaded_by_name.ilike(like))
        )
    files = q.order_by(StoredFile.id.desc()).limit(200).all()
    base_url = resolve_public_base_url(request)
    results = []
    for f in files:
        links = (
            db.query(FilePreviewLink)
            .filter(FilePreviewLink.file_id == f.id)
            .order_by(FilePreviewLink.id.desc())
            .all()
        )
        results.append(serialize_stored_file(f, links, base_url))
    return results


@app.post("/api/files/upload")
async def upload_permanent_file(
    request: Request,
    file: UploadFile = File(...),
    module: str = Form("documents"),
    category: str = Form("general"),
    description: str = Form(""),
    associatedRecordType: Optional[str] = Form(None),
    associatedRecordId: Optional[int] = Form(None),
    current_user: User = Depends(require_perm("upload_files")),
    db: Session = Depends(get_db),
):
    content = await file.read()
    rec = save_permanent_file(
        db=db,
        content=content,
        original_filename=file.filename or "document",
        declared_mime=file.content_type,
        user=current_user,
        module=module,
        category=category,
        description=description,
        associated_record_type=associatedRecordType,
        associated_record_id=associatedRecordId,
    )
    record_audit(
        db,
        "PERMANENT_FILE_UPLOADED",
        "stored_file",
        rec.id,
        f'Uploaded "{rec.original_filename}" ({rec.file_size_bytes} bytes) to {rec.relative_path}.',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("file:uploaded", current_user.full_name, f"Uploaded file {rec.original_filename}")
    return JSONResponse(
        status_code=201,
        content=serialize_stored_file(rec, [], resolve_public_base_url(request)),
    )


@app.get("/api/files/preview/{token}")
def get_public_preview_metadata(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    rec, link = verify_preview_token(db, token, increment_access=False)
    base_url = resolve_public_base_url(request)
    return {
        "readOnly": True,
        "fileId": rec.id,
        "originalFilename": rec.original_filename,
        "extension": rec.extension,
        "mimeType": rec.mime_type,
        "fileSizeBytes": rec.file_size_bytes,
        "module": rec.module,
        "category": rec.category,
        "description": rec.description,
        "uploadedByName": rec.uploaded_by_name,
        "uploadedAt": rec.uploaded_at.isoformat() + "Z",
        "previewKind": (
            "pdf"
            if rec.extension == ".pdf"
            else "image"
            if rec.extension in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")
            else "spreadsheet"
            if rec.extension in (".csv", ".xlsx", ".xls")
            else "text"
            if rec.extension in (".txt", ".json")
            else "document"
        ),
        "expiresAt": link.expires_at.isoformat() + "Z",
        "ttlHours": int(settings.PREVIEW_LINK_TTL_HOURS or 144),
        "contentUrl": f"{base_url}/api/files/preview/{token}/content",
        "downloadReadOnlyUrl": f"{base_url}/api/files/preview/{token}/content?download=1",
        "sheetPreviewUrl": f"{base_url}/api/files/preview/{token}/sheet"
        if rec.extension in (".csv", ".xlsx")
        else None,
    }


@app.get("/api/files/preview/{token}/content")
def stream_public_preview_content(
    token: str,
    download: int = 0,
    db: Session = Depends(get_db),
):
    rec, _link = verify_preview_token(db, token, increment_access=True)
    safe_path = resolve_safe_storage_path(rec)
    disp = "attachment" if download == 1 else "inline"
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Disposition": f'{disp}; filename="{rec.original_filename}"',
    }
    if rec.mime_type == "image/svg+xml":
        headers["Content-Security-Policy"] = "sandbox"
    return FileResponse(safe_path, media_type=rec.mime_type, headers=headers)


@app.get("/api/files/preview/{token}/sheet")
def get_public_preview_sheet(token: str, db: Session = Depends(get_db)):
    rec, _link = verify_preview_token(db, token, increment_access=False)
    safe_path = resolve_safe_storage_path(rec)
    if rec.extension not in (".csv", ".xlsx"):
        raise HTTPException(status_code=400, detail="Spreadsheet table preview is only available for CSV/XLSX files.")
    return extract_spreadsheet_preview(safe_path, rec.extension)


@app.post("/api/files/{file_id}/preview-links")
def generate_file_preview_link(
    file_id: int,
    request: Request,
    current_user: User = Depends(require_perm("upload_files")),
    db: Session = Depends(get_db),
):
    rec = (
        db.query(StoredFile)
        .filter(StoredFile.id == file_id, StoredFile.is_active == True)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Stored file not found.")
    resolve_safe_storage_path(rec)
    link_data = create_preview_link(db, rec, current_user, request)
    record_audit(
        db,
        "PREVIEW_LINK_CREATED",
        "file_preview_link",
        link_data["id"],
        f'Generated 144h signed live preview link for file #{rec.id} ("{rec.original_filename}"), expires {link_data["expiresAt"]}.',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    return JSONResponse(status_code=201, content=link_data)


@app.get("/api/files/{file_id}/preview-links")
def list_file_preview_links(
    file_id: int,
    request: Request,
    current_user: User = Depends(require_perm("view_files")),
    db: Session = Depends(get_db),
):
    links = (
        db.query(FilePreviewLink)
        .filter(FilePreviewLink.file_id == file_id)
        .order_by(FilePreviewLink.id.desc())
        .all()
    )
    base_url = resolve_public_base_url(request)
    from datetime import timezone
    out = []
    for lnk in links:
        exp_unix = int(lnk.expires_at.replace(tzinfo=timezone.utc).timestamp())
        tok = f"{lnk.token_id}.{lnk.file_id}.{exp_unix}.{lnk.signature_hmac}"
        out.append(serialize_preview_link(lnk, tok, base_url, int(settings.PREVIEW_LINK_TTL_HOURS or 144)))
    return out


@app.post("/api/files/preview-links/{link_id}/revoke")
def revoke_file_preview_link(
    link_id: int,
    request: Request,
    payload: Optional[Dict[str, str]] = None,
    current_user: User = Depends(require_perm("manage_preview_links")),
    db: Session = Depends(get_db),
):
    lnk = db.query(FilePreviewLink).filter(FilePreviewLink.id == link_id).first()
    if not lnk:
        raise HTTPException(status_code=404, detail="Preview link not found.")
    lnk.is_revoked = True
    lnk.revoked_at = datetime.utcnow()
    lnk.revoked_by_user_id = current_user.id
    lnk.revoked_by_name = current_user.full_name
    lnk.revoke_reason = (payload or {}).get("reason") or "Revoked by authorized administrator"
    record_audit(
        db,
        "PREVIEW_LINK_REVOKED",
        "file_preview_link",
        lnk.id,
        f'Revoked preview link #{lnk.id} for file #{lnk.file_id}.',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    return {"ok": True, "id": lnk.id, "isRevoked": True}


@app.get("/api/files/{file_id}")
def get_stored_file_details(
    file_id: int,
    request: Request,
    current_user: User = Depends(require_perm("view_files")),
    db: Session = Depends(get_db),
):
    rec = (
        db.query(StoredFile)
        .filter(StoredFile.id == file_id, StoredFile.is_active == True)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="File not found.")
    links = (
        db.query(FilePreviewLink)
        .filter(FilePreviewLink.file_id == rec.id)
        .order_by(FilePreviewLink.id.desc())
        .all()
    )
    return serialize_stored_file(rec, links, resolve_public_base_url(request))


@app.get("/api/files/{file_id}/download")
def download_stored_file(
    file_id: int,
    current_user: User = Depends(require_perm("view_files")),
    db: Session = Depends(get_db),
):
    rec = (
        db.query(StoredFile)
        .filter(StoredFile.id == file_id, StoredFile.is_active == True)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="File not found.")
    safe_path = resolve_safe_storage_path(rec)
    return FileResponse(
        safe_path,
        media_type=rec.mime_type,
        filename=rec.original_filename,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.get("/api/files/{file_id}/view")
def view_stored_file_inline(
    file_id: int,
    current_user: User = Depends(require_perm("view_files")),
    db: Session = Depends(get_db),
):
    rec = (
        db.query(StoredFile)
        .filter(StoredFile.id == file_id, StoredFile.is_active == True)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="File not found.")
    safe_path = resolve_safe_storage_path(rec)
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f'inline; filename="{rec.original_filename}"',
    }
    if rec.mime_type == "image/svg+xml":
        headers["Content-Security-Policy"] = "sandbox"
    return FileResponse(safe_path, media_type=rec.mime_type, headers=headers)


# ---------- Campaigns ----------
@app.get("/api/campaigns")
def list_campaigns(
    current_user: User = Depends(require_perm("view_command_room")),
    db: Session = Depends(get_db),
):
    rows = db.query(Campaign).order_by(Campaign.id.asc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "roundCode": r.round_code,
            "vaccines": r.vaccines,
            "startDate": r.start_date,
            "endDate": r.end_date,
            "expectedDays": r.expected_days,
            "status": r.status,
            "createdAt": r.created_at.isoformat() + "Z",
        }
        for r in rows
    ]


@app.post("/api/campaigns")
async def create_campaign(
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_perm("manage_settings")),
    db: Session = Depends(get_db),
):
    name = (payload.get("name") or "").strip()
    round_code = (payload.get("roundCode") or "").strip()
    start_date = (payload.get("startDate") or "").strip()
    end_date = (payload.get("endDate") or "").strip()
    if not name or not round_code or not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Name, round code, start date, and end date are required.")

    camp = Campaign(
        name=name,
        round_code=round_code,
        vaccines=str(payload.get("vaccines") or "nOPV2 & bOPV2"),
        start_date=start_date,
        end_date=end_date,
        expected_days=int(payload.get("expectedDays") or 4),
        status="active",
    )
    db.add(camp)
    db.flush()
    record_audit(
        db,
        "CAMPAIGN_CREATED",
        "campaign",
        camp.id,
        f'Created campaign "{name}" ({round_code}).',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("settings:updated", current_user.full_name, f'Campaign round "{round_code}" created.')
    return JSONResponse(status_code=201, content={"id": camp.id})


# ---------- Dashboard, Analytics & Command Room ----------
@app.get("/api/dashboard/summary")
def dashboard_summary(
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    reportDate: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_dashboard_access),
    db: Session = Depends(get_db),
):
    return compute_dashboard_summary(db, campaignId, dayNum, reportDate, zone, woreda)


@app.get("/api/analytics/advanced")
def get_advanced_analytics(
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    reportDate: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_dashboard_access),
    db: Session = Depends(get_db),
):
    return compute_advanced_analytics(db, campaignId, dayNum, reportDate, zone, woreda)


@app.get("/api/command-room/state")
def command_room_state(
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    reportDate: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_perm("view_command_room")),
    db: Session = Depends(get_db),
):
    return get_command_room_state(db, campaignId, dayNum, reportDate, zone, woreda)


@app.get("/api/command-room/woredas")
def command_room_woredas(
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    reportDate: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    page: int = 1,
    pageSize: int = 25,
    status: Optional[str] = None,
    current_user: User = Depends(require_perm("view_command_room")),
    db: Session = Depends(get_db),
):
    adv = compute_advanced_analytics(db, campaignId, dayNum, reportDate, zone, woreda)
    items = adv["allWoredas"]
    if status:
        items = [w for w in items if w["statusCategory"] == status]
    total = len(items)
    start = max(0, (page - 1) * pageSize)
    return {
        "items": items[start : start + pageSize],
        "total": total,
        "page": page,
        "pageSize": pageSize,
    }


@app.get("/api/locations")
def list_locations(
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_dashboard_access),
    db: Session = Depends(get_db),
):
    q = db.query(AdminLocation).filter(AdminLocation.is_active == True)
    if zone:
        q = q.filter(AdminLocation.canonical_zone == zone)
    if woreda:
        q = q.filter(AdminLocation.canonical_woreda == woreda)
    rows = q.order_by(AdminLocation.canonical_zone.asc(), AdminLocation.canonical_woreda.asc()).all()
    return [
        {
            "id": r.id,
            "serialNo": r.serial_no,
            "rawRegion": r.raw_region,
            "rawZone": r.raw_zone,
            "rawWoreda": r.raw_woreda,
            "canonicalRegion": r.canonical_region,
            "canonicalZone": r.canonical_zone,
            "canonicalWoreda": r.canonical_woreda,
            "locationType": r.location_type,
            "plannedTarget": r.planned_target,
            "dailyTarget": r.daily_target,
            "isActive": bool(r.is_active),
        }
        for r in rows
    ]


@app.get("/api/reports/daily")
def list_daily_reports(
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    reportDate: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_dashboard_access),
    db: Session = Depends(get_db),
):
    q = db.query(CampaignDailyReport).filter(
        CampaignDailyReport.campaign_id == campaignId,
        CampaignDailyReport.is_active == True,
    )
    if dayNum:
        q = q.filter(CampaignDailyReport.campaign_day_num == dayNum)
    if reportDate:
        q = q.filter(CampaignDailyReport.report_date == reportDate)
    if zone:
        q = q.filter(CampaignDailyReport.canonical_zone == zone)
    if woreda:
        q = q.filter(CampaignDailyReport.canonical_woreda == woreda)

    rows = q.order_by(CampaignDailyReport.campaign_day_num.asc(), CampaignDailyReport.id.asc()).all()
    return [
        {
            "id": r.id,
            "campaignId": r.campaign_id,
            "importBatchId": r.import_batch_id,
            "serialNo": r.serial_no,
            "rawRegion": r.raw_region,
            "rawZone": r.raw_zone,
            "rawWoreda": r.raw_woreda,
            "canonicalZone": r.canonical_zone,
            "canonicalWoreda": r.canonical_woreda,
            "campaignDayLabel": r.campaign_day_label,
            "campaignDayNum": r.campaign_day_num,
            "reportDate": r.report_date,
            "totalPlannedTarget": r.total_planned_target,
            "dailyTarget": r.daily_target,
            "vacc0_11Before": r.vacc_0_11_before,
            "vacc0_11NotBefore": r.vacc_0_11_not_before,
            "vacc12_59Before": r.vacc_12_59_before,
            "vacc12_59NotBefore": r.vacc_12_59_not_before,
            "vacc60_120Before": r.vacc_60_120_before,
            "vacc60_120NotBefore": r.vacc_60_120_not_before,
            "totalVaccinated0_59": r.total_vaccinated_0_59,
            "dailyCoveredPct": r.daily_covered_pct,
            "coveredFromTotalPct": r.covered_from_total_pct,
            "nopv2VialsReceived": r.nopv2_vials_received,
            "nopv2VialsUsed": r.nopv2_vials_used,
            "nopv2VialsPartiallyUsed": r.nopv2_vials_partially_used,
            "nopv2VialsReturnedUnusedGood": r.nopv2_vials_returned_unused_good,
            "nopv2VialsBroken": r.nopv2_vials_broken,
            "nopv2VialsReturnedBad": r.nopv2_vials_returned_bad,
            "nopv2VialsLost": r.nopv2_vials_lost,
            "nopv2WastageRatePct": r.nopv2_wastage_rate_pct,
            "bopvVialsReceived": r.bopv_vials_received,
            "bopvVialsUsed": r.bopv_vials_used,
            "bopvVialsPartiallyUsed": r.bopv_vials_partially_used,
            "bopvVialsReturnedUnusedGood": r.bopv_vials_returned_unused_good,
            "bopvVialsBroken": r.bopv_vials_broken,
            "bopvVialsReturnedBad": r.bopv_vials_returned_bad,
            "bopvVialsLost": r.bopv_vials_lost,
            "bopvWastageRatePct": r.bopv_wastage_rate_pct,
            "afpAlertsCount": r.afp_alerts_count,
            "aefiAlertsCount": r.aefi_alerts_count,
            "smHhsVisited": r.sm_hhs_visited,
            "smGroupDiscussions": r.sm_group_discussions,
            "smIpcReached": r.sm_ipc_reached,
            "zdIdentifiedLinked": r.zd_identified_linked,
            "zdVaccinated": r.zd_vaccinated,
            "uvIdentifiedLinked": r.uv_identified_linked,
            "uvVaccinated": r.uv_vaccinated,
            "teamsTotal": r.teams_total,
            "teamsReported": r.teams_reported,
            "remarks": r.remarks,
            "hasReportedActivity": bool(r.has_reported_activity),
            "sourceSubmittedAt": r.source_submitted_at,
            "uploadedAt": r.uploaded_at.isoformat() + "Z",
            "version": r.version,
            "isActive": bool(r.is_active),
        }
        for r in rows
    ]


@app.patch("/api/reports/daily/{report_id}/correct")
async def correct_daily_report(
    report_id: int,
    patch: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_perm("correct_data")),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(CampaignDailyReport)
        .filter(CampaignDailyReport.id == report_id, CampaignDailyReport.is_active == True)
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Active campaign report record not found.")

    camel_map = {
        "vacc0_11Before": "vacc_0_11_before",
        "vacc0_11NotBefore": "vacc_0_11_not_before",
        "vacc12_59Before": "vacc_12_59_before",
        "vacc12_59NotBefore": "vacc_12_59_not_before",
        "vacc60_120Before": "vacc_60_120_before",
        "vacc60_120NotBefore": "vacc_60_120_not_before",
        "totalVaccinated0_59": "total_vaccinated_0_59",
        "nopv2VialsReceived": "nopv2_vials_received",
        "nopv2VialsUsed": "nopv2_vials_used",
        "bopvVialsReceived": "bopv_vials_received",
        "bopvVialsUsed": "bopv_vials_used",
        "afpAlertsCount": "afp_alerts_count",
        "aefiAlertsCount": "aefi_alerts_count",
        "smHhsVisited": "sm_hhs_visited",
        "smGroupDiscussions": "sm_group_discussions",
        "smIpcReached": "sm_ipc_reached",
        "zdIdentifiedLinked": "zd_identified_linked",
        "zdVaccinated": "zd_vaccinated",
        "uvIdentifiedLinked": "uv_identified_linked",
        "uvVaccinated": "uv_vaccinated",
        "teamsTotal": "teams_total",
        "teamsReported": "teams_reported",
        "remarks": "remarks",
    }

    existing.is_active = False
    new_rec = CampaignDailyReport(
        campaign_id=existing.campaign_id,
        import_batch_id=existing.import_batch_id,
        serial_no=existing.serial_no,
        raw_region=existing.raw_region,
        raw_zone=existing.raw_zone,
        raw_woreda=existing.raw_woreda,
        canonical_region=existing.canonical_region,
        canonical_zone=existing.canonical_zone,
        canonical_woreda=existing.canonical_woreda,
        campaign_day_label=existing.campaign_day_label,
        campaign_day_num=existing.campaign_day_num,
        report_date=existing.report_date,
        total_planned_target=existing.total_planned_target,
        daily_target=existing.daily_target,
        vacc_0_11_before=existing.vacc_0_11_before,
        vacc_0_11_not_before=existing.vacc_0_11_not_before,
        vacc_12_59_before=existing.vacc_12_59_before,
        vacc_12_59_not_before=existing.vacc_12_59_not_before,
        vacc_60_120_before=existing.vacc_60_120_before,
        vacc_60_120_not_before=existing.vacc_60_120_not_before,
        total_vaccinated_0_59=existing.total_vaccinated_0_59,
        nopv2_vials_received=existing.nopv2_vials_received,
        nopv2_vials_used=existing.nopv2_vials_used,
        nopv2_vials_partially_used=existing.nopv2_vials_partially_used,
        nopv2_vials_returned_unused_good=existing.nopv2_vials_returned_unused_good,
        nopv2_vials_broken=existing.nopv2_vials_broken,
        nopv2_vials_returned_bad=existing.nopv2_vials_returned_bad,
        nopv2_vials_lost=existing.nopv2_vials_lost,
        nopv2_wastage_rate_pct=existing.nopv2_wastage_rate_pct,
        bopv_vials_received=existing.bopv_vials_received,
        bopv_vials_used=existing.bopv_vials_used,
        bopv_vials_partially_used=existing.bopv_vials_partially_used,
        bopv_vials_returned_unused_good=existing.bopv_vials_returned_unused_good,
        bopv_vials_broken=existing.bopv_vials_broken,
        bopv_vials_returned_bad=existing.bopv_vials_returned_bad,
        bopv_vials_lost=existing.bopv_vials_lost,
        bopv_wastage_rate_pct=existing.bopv_wastage_rate_pct,
        afp_alerts_count=existing.afp_alerts_count,
        aefi_alerts_count=existing.aefi_alerts_count,
        sm_hhs_visited=existing.sm_hhs_visited,
        sm_group_discussions=existing.sm_group_discussions,
        sm_ipc_reached=existing.sm_ipc_reached,
        zd_identified_linked=existing.zd_identified_linked,
        zd_vaccinated=existing.zd_vaccinated,
        uv_identified_linked=existing.uv_identified_linked,
        uv_vaccinated=existing.uv_vaccinated,
        teams_total=existing.teams_total,
        teams_reported=existing.teams_reported,
        remarks=existing.remarks,
        has_reported_activity=True,
        source_submitted_at=existing.source_submitted_at,
        version=existing.version + 1,
        is_active=True,
    )
    for camel, snake in camel_map.items():
        if camel in patch and patch[camel] is not None:
            setattr(new_rec, snake, patch[camel])

    new_rec.daily_covered_pct = (
        round((new_rec.total_vaccinated_0_59 / new_rec.daily_target) * 100, 2)
        if new_rec.daily_target > 0
        else 0.0
    )
    new_rec.covered_from_total_pct = (
        round((new_rec.total_vaccinated_0_59 / new_rec.total_planned_target) * 100, 2)
        if new_rec.total_planned_target > 0
        else 0.0
    )
    db.add(new_rec)
    db.flush()
    record_audit(
        db,
        "RECORD_CORRECTED",
        "campaign_daily_report",
        new_rec.id,
        f"Corrected record #{report_id} -> v{new_rec.version} (#{new_rec.id}) for {existing.canonical_zone}/{existing.canonical_woreda}.",
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse(
        "record:corrected",
        current_user.full_name,
        f"Report corrected for {existing.canonical_woreda} ({existing.canonical_zone})",
    )
    return {"ok": True, "id": new_rec.id}


# ---------- Data Upload & Import Center ----------
def _serialize_import_batch(b: ImportBatch) -> Dict[str, Any]:
    return {
        "id": b.id,
        "campaignId": b.campaign_id,
        "originalFilename": b.original_filename,
        "storedPath": b.stored_path,
        "storedFileId": getattr(b, "stored_file_id", None),
        "fileSizeBytes": b.file_size_bytes,
        "fileFormat": b.file_format,
        "detectedTemplate": b.detected_template,
        "importMode": b.import_mode,
        "validationStatus": b.validation_status,
        "detectedRecords": b.detected_records,
        "importedRecords": b.imported_records,
        "updatedRecords": b.updated_records,
        "skippedRecords": b.skipped_records,
        "rejectedRecords": b.rejected_records,
        "uploadedByUserId": b.uploaded_by_user_id or 0,
        "uploadedByName": b.uploaded_by_name,
        "uploadedAt": b.uploaded_at.isoformat() + "Z",
        "confirmedAt": b.confirmed_at.isoformat() + "Z" if b.confirmed_at else None,
        "status": b.status,
        "rolledBackAt": b.rolled_back_at.isoformat() + "Z" if b.rolled_back_at else None,
        "rolledBackByName": b.rolled_back_by_name,
        "notes": b.notes,
    }


@app.post("/api/imports/stage")
async def stage_import(
    file: UploadFile = File(...),
    campaignId: int = Form(1),
    current_user: User = Depends(require_upload_access),
):
    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds max limit")

    staging_id = str(uuid.uuid4())
    safe_name = os.path.basename(file.filename or "report.xlsx")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in (".xlsx", ".csv"):
        raise HTTPException(status_code=400, detail="Unsupported file format. Only .xlsx and .csv files are accepted.")

    staged_file_path = os.path.join(STAGING_DIR, f"{staging_id}_{safe_name}")
    with open(staged_file_path, "wb") as f:
        f.write(content)

    parsed = parse_campaign_file(content, safe_name)
    staged_payload = {
        "campaign_id": campaignId,
        "original_filename": safe_name,
        "staged_path": staged_file_path,
        "file_size_bytes": len(content),
        "file_format": ext.lstrip("."),
        "content_type": file.content_type or ("text/csv" if ext == ".csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "parsed": parsed,
    }
    STAGING_STORE[staging_id] = staged_payload
    with open(os.path.join(STAGING_DIR, f"{staging_id}.json"), "w", encoding="utf-8") as mf:
        json.dump(staged_payload, mf)

    days = sorted({r["campaign_day_num"] for r in parsed["rows"] if r.get("campaign_day_num")})
    return {
        "stagingId": staging_id,
        "originalFilename": safe_name,
        "fileSizeBytes": len(content),
        "fileFormat": "csv" if ext == ".csv" else "xlsx",
        "detectedTemplate": "Oromia SIA Daily Admin Report",
        "headerRowsDetected": parsed.get("header_rows_detected", 1),
        "unexpectedColumns": [],
        "totalRowsDetected": len(parsed["rows"]),
        "totalSummaryRowsSkipped": parsed["total_summary_rows_skipped"],
        "validRowsCount": len(parsed["rows"]),
        "warningRowsCount": 0,
        "rejectedRowsCount": len(parsed["issues"]),
        "duplicateRowsCount": 0,
        "newRowsCount": len(parsed["rows"]),
        "validationStatus": "passed_with_warnings" if parsed["issues"] else "passed",
        "issues": parsed["issues"],
        "previewRows": [],
        "detectedDays": days,
    }


@app.post("/api/imports/confirm")
async def confirm_import(
    payload: Dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm("confirm_import")),
):
    staging_id = payload.get("stagingId")
    staged = STAGING_STORE.pop(staging_id, None)
    meta_file = os.path.join(STAGING_DIR, f"{staging_id}.json")
    if not staged and os.path.exists(meta_file):
        with open(meta_file, "r", encoding="utf-8") as mf:
            staged = json.load(mf)
    if not staged or not os.path.exists(staged["staged_path"]):
        raise HTTPException(status_code=404, detail="Staging session expired or not found.")

    with open(staged["staged_path"], "rb") as rf:
        raw_bytes = rf.read()

    # Save permanently in /var/lib/ohb-opcms/uploads/imports/YYYY/MM/...
    perm_file = save_permanent_file(
        db=db,
        content=raw_bytes,
        original_filename=staged["original_filename"],
        declared_mime=staged.get("content_type"),
        user=current_user,
        module="imports",
        category="campaign_reports",
        description=payload.get("notes") or "Confirmed SIA daily administrative report import",
        associated_record_type="campaign",
        associated_record_id=staged["campaign_id"],
    )

    # Clean up staging temporary files
    for p in (staged["staged_path"], meta_file):
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass

    import_mode = payload.get("importMode", "incremental_skip")
    parsed = staged["parsed"]

    batch = ImportBatch(
        campaign_id=staged["campaign_id"],
        original_filename=staged["original_filename"],
        stored_path=perm_file.storage_path,
        stored_file_id=perm_file.id,
        file_size_bytes=staged["file_size_bytes"],
        file_format=staged["file_format"],
        detected_template="Oromia SIA Daily Admin Report",
        import_mode=import_mode,
        validation_status="passed_with_warnings" if parsed["issues"] else "passed",
        detected_records=len(parsed["rows"]),
        uploaded_by_user_id=current_user.id,
        uploaded_by_name=current_user.full_name,
        confirmed_at=datetime.utcnow(),
        status="confirmed",
        notes=payload.get("notes"),
    )
    db.add(batch)
    db.flush()
    perm_file.associated_record_type = "import_batch"
    perm_file.associated_record_id = batch.id

    imported = 0
    updated = 0
    skipped = 0

    for r in parsed["rows"]:
        existing = (
            db.query(CampaignDailyReport)
            .filter(
                CampaignDailyReport.campaign_id == staged["campaign_id"],
                CampaignDailyReport.campaign_day_num == r["campaign_day_num"],
                func.lower(CampaignDailyReport.canonical_zone) == r["canonical_zone"].lower(),
                func.lower(CampaignDailyReport.canonical_woreda) == r["canonical_woreda"].lower(),
                CampaignDailyReport.is_active == True,
            )
            .first()
        )
        version = 1
        if existing:
            if import_mode == "incremental_skip":
                skipped += 1
                continue
            existing.is_active = False
            existing.superseded_by_import_id = batch.id
            version = existing.version + 1
            updated += 1
        else:
            imported += 1

        has_activity = (
            r["total_vaccinated_0_59"] > 0
            or (r["nopv2_vials_used"] or 0) > 0
            or (r["bopv_vials_used"] or 0) > 0
            or r["teams_reported"] > 0
        )

        rec = CampaignDailyReport(
            campaign_id=staged["campaign_id"],
            import_batch_id=batch.id,
            serial_no=r["serial_no"],
            raw_region=r["raw_region"],
            raw_zone=r["raw_zone"],
            raw_woreda=r["raw_woreda"],
            canonical_region=r["canonical_region"],
            canonical_zone=r["canonical_zone"],
            canonical_woreda=r["canonical_woreda"],
            campaign_day_label=r["campaign_day_label"],
            campaign_day_num=r["campaign_day_num"],
            total_planned_target=r["total_planned_target"],
            daily_target=r["daily_target"],
            vacc_0_11_before=r["vacc_0_11_before"],
            vacc_0_11_not_before=r["vacc_0_11_not_before"],
            vacc_12_59_before=r["vacc_12_59_before"],
            vacc_12_59_not_before=r["vacc_12_59_not_before"],
            vacc_60_120_before=r["vacc_60_120_before"],
            vacc_60_120_not_before=r["vacc_60_120_not_before"],
            total_vaccinated_0_59=r["total_vaccinated_0_59"],
            daily_covered_pct=r["daily_covered_pct"],
            covered_from_total_pct=r["covered_from_total_pct"],
            nopv2_vials_received=r["nopv2_vials_received"],
            nopv2_vials_used=r["nopv2_vials_used"],
            nopv2_vials_partially_used=r["nopv2_vials_partially_used"],
            nopv2_vials_returned_unused_good=r["nopv2_vials_returned_unused_good"],
            nopv2_vials_broken=r["nopv2_vials_broken"],
            nopv2_vials_returned_bad=r["nopv2_vials_returned_bad"],
            nopv2_vials_lost=r["nopv2_vials_lost"],
            nopv2_wastage_rate_pct=r["nopv2_wastage_rate_pct"],
            bopv_vials_received=r["bopv_vials_received"],
            bopv_vials_used=r["bopv_vials_used"],
            bopv_vials_partially_used=r["bopv_vials_partially_used"],
            bopv_vials_returned_unused_good=r["bopv_vials_returned_unused_good"],
            bopv_vials_broken=r["bopv_vials_broken"],
            bopv_vials_returned_bad=r["bopv_vials_returned_bad"],
            bopv_vials_lost=r["bopv_vials_lost"],
            bopv_wastage_rate_pct=r["bopv_wastage_rate_pct"],
            afp_alerts_count=r["afp_alerts_count"],
            aefi_alerts_count=r["aefi_alerts_count"],
            sm_hhs_visited=r["sm_hhs_visited"],
            sm_group_discussions=r["sm_group_discussions"],
            sm_ipc_reached=r["sm_ipc_reached"],
            zd_identified_linked=r["zd_identified_linked"],
            zd_vaccinated=r["zd_vaccinated"],
            uv_identified_linked=r["uv_identified_linked"],
            uv_vaccinated=r["uv_vaccinated"],
            teams_total=r["teams_total"],
            teams_reported=r["teams_reported"],
            remarks=r["remarks"],
            has_reported_activity=has_activity,
            source_submitted_at=payload.get("sourceSubmittedAt"),
            version=version,
            is_active=True,
        )
        db.add(rec)
        db.flush()

        if r["afp_alerts_count"] > 0:
            db.add(
                SurveillanceAlert(
                    campaign_id=staged["campaign_id"],
                    report_id=rec.id,
                    alert_type="AFP",
                    canonical_zone=r["canonical_zone"],
                    canonical_woreda=r["canonical_woreda"],
                    campaign_day_num=r["campaign_day_num"],
                    administrative_alert_count=r["afp_alerts_count"],
                    source_remarks=r["remarks"],
                )
            )
        if r["aefi_alerts_count"] > 0:
            db.add(
                SurveillanceAlert(
                    campaign_id=staged["campaign_id"],
                    report_id=rec.id,
                    alert_type="AEFI",
                    canonical_zone=r["canonical_zone"],
                    canonical_woreda=r["canonical_woreda"],
                    campaign_day_num=r["campaign_day_num"],
                    administrative_alert_count=r["aefi_alerts_count"],
                    source_remarks=r["remarks"],
                )
            )

    batch.imported_records = imported
    batch.updated_records = updated
    batch.skipped_records = skipped
    record_audit(
        db,
        "IMPORT_CONFIRMED",
        "import_batch",
        batch.id,
        f'Confirmed import "{batch.original_filename}": {imported} inserted, {updated} updated, {skipped} skipped.',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()

    await broadcast_sse(
        "import:confirmed",
        batch.uploaded_by_name,
        f"Imported {batch.original_filename} ({imported} new, {updated} updated)",
    )
    return JSONResponse(status_code=201, content=_serialize_import_batch(batch))


@app.get("/api/imports/history")
def import_history(
    campaignId: Optional[int] = None,
    current_user: User = Depends(require_upload_access),
    db: Session = Depends(get_db),
):
    q = db.query(ImportBatch)
    if campaignId:
        q = q.filter(ImportBatch.campaign_id == campaignId)
    rows = q.order_by(ImportBatch.id.desc()).all()
    return [_serialize_import_batch(b) for b in rows]


@app.get("/api/imports/{batch_id}/download")
def download_import_file(
    batch_id: int,
    current_user: User = Depends(require_upload_access),
    db: Session = Depends(get_db),
):
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch or not os.path.exists(batch.stored_path):
        raise HTTPException(status_code=404, detail="Original uploaded file not found on server.")
    return FileResponse(batch.stored_path, filename=batch.original_filename)


@app.post("/api/imports/{batch_id}/rollback")
async def rollback_import(
    batch_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_perm("rollback_import")),
):
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch or batch.status == "rolled_back":
        raise HTTPException(status_code=404, detail="Active import batch not found")

    db.query(CampaignDailyReport).filter(
        CampaignDailyReport.import_batch_id == batch_id
    ).update({"is_active": False})

    db.query(CampaignDailyReport).filter(
        CampaignDailyReport.superseded_by_import_id == batch_id
    ).update({"is_active": True, "superseded_by_import_id": None})

    batch.status = "rolled_back"
    batch.rolled_back_at = datetime.utcnow()
    batch.rolled_back_by_name = current_user.full_name
    record_audit(
        db,
        "IMPORT_ROLLED_BACK",
        "import_batch",
        batch.id,
        f'Rolled back import batch #{batch.id} ("{batch.original_filename}").',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()

    await broadcast_sse(
        "import:rolled_back",
        current_user.full_name,
        f"Import batch #{batch_id} rolled back",
    )
    return _serialize_import_batch(batch)


@app.get("/api/templates/official")
def download_official_template(
    format: str = "csv",
    current_user: User = Depends(require_upload_access),
):
    candidate = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "public",
            "assets",
            "aistudio",
            "Oromia_Region___Round_1_nOPV2_and_bOPV2_SIA_Campaign_Daily_Administrative_Report___November_2026_4b46f787.csv",
        )
    )
    if not os.path.exists(candidate):
        raise HTTPException(status_code=404, detail="Official reporting template file not found.")
    if format != "xlsx":
        return FileResponse(
            candidate,
            media_type="text/csv",
            filename="Oromia_Region_Round1_nOPV2_bOPV2_SIA_Daily_Admin_Template.csv",
        )
    wb = openpyxl.Workbook()
    ws = wb.active
    with open(candidate, "r", encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.reader(f):
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="Oromia_Region_Round1_nOPV2_bOPV2_SIA_Daily_Admin_Template.xlsx"'
        },
    )


# ---------- Surveillance Alerts ----------
@app.get("/api/alerts")
def list_alerts(
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_dashboard_access),
    db: Session = Depends(get_db),
):
    q = db.query(SurveillanceAlert).filter(
        SurveillanceAlert.campaign_id == campaignId,
        SurveillanceAlert.is_active == True,
    )
    if dayNum:
        q = q.filter(SurveillanceAlert.campaign_day_num == dayNum)
    if zone:
        q = q.filter(SurveillanceAlert.canonical_zone == zone)
    if woreda:
        q = q.filter(SurveillanceAlert.canonical_woreda == woreda)
    rows = q.order_by(SurveillanceAlert.id.desc()).all()
    return [
        {
            "id": a.id,
            "campaignId": a.campaign_id,
            "reportId": a.report_id,
            "alertType": a.alert_type,
            "canonicalZone": a.canonical_zone,
            "canonicalWoreda": a.canonical_woreda,
            "campaignDayNum": a.campaign_day_num,
            "reportDate": a.report_date,
            "administrativeAlertCount": a.administrative_alert_count,
            "verifiedClinicalCases": a.verified_clinical_cases,
            "clinicalStatus": a.clinical_status,
            "sourceRemarks": a.source_remarks,
            "followUpNotes": a.follow_up_notes,
            "assignedInvestigator": a.assigned_investigator,
            "updatedByName": a.updated_by_name,
            "createdAt": a.created_at.isoformat() + "Z",
            "updatedAt": a.updated_at.isoformat() + "Z",
        }
        for a in rows
    ]


@app.patch("/api/alerts/{alert_id}")
async def update_alert(
    alert_id: int,
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_perm("manage_alerts")),
    db: Session = Depends(get_db),
):
    a = (
        db.query(SurveillanceAlert)
        .filter(SurveillanceAlert.id == alert_id, SurveillanceAlert.is_active == True)
        .first()
    )
    if not a:
        raise HTTPException(status_code=404, detail="Surveillance alert not found.")
    valid = {"reported_pending", "under_investigation", "sample_collected", "verified_confirmed", "discarded"}
    if payload.get("clinicalStatus") in valid:
        a.clinical_status = payload["clinicalStatus"]
    if payload.get("verifiedClinicalCases") is not None:
        a.verified_clinical_cases = max(0, int(payload["verifiedClinicalCases"]))
    if payload.get("followUpNotes") is not None:
        a.follow_up_notes = str(payload["followUpNotes"])
    if payload.get("assignedInvestigator") is not None:
        a.assigned_investigator = str(payload["assignedInvestigator"])
    a.updated_by_name = current_user.full_name
    a.updated_at = datetime.utcnow()
    record_audit(
        db,
        "ALERT_FOLLOWUP_UPDATED",
        "surveillance_alert",
        a.id,
        f"Updated {a.alert_type} alert #{a.id} ({a.canonical_zone}/{a.canonical_woreda}) to {a.clinical_status}.",
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("alert:updated", current_user.full_name, f"{a.alert_type} alert updated for {a.canonical_woreda}")
    return {"ok": True}


# ---------- Geo Boundaries ----------
@app.get("/api/geo/boundaries")
def get_geo_boundaries(
    current_user: User = Depends(require_perm("view_command_room")),
    db: Session = Depends(get_db),
):
    rows = db.query(GeoBoundary).order_by(GeoBoundary.id.desc()).all()
    return [
        {
            "id": r.id,
            "level": r.level,
            "nameField": r.name_field,
            "featureCount": r.feature_count,
            "uploadedByName": r.uploaded_by_name,
            "uploadedAt": r.uploaded_at.isoformat() + "Z",
            "geojson": json.loads(r.geojson_text),
        }
        for r in rows
    ]


@app.post("/api/geo/boundaries")
async def upload_geo_boundary(
    request: Request,
    file: UploadFile = File(...),
    level: str = Form("woreda"),
    nameField: Optional[str] = Form(None),
    current_user: User = Depends(require_perm("upload_geo")),
    db: Session = Depends(get_db),
):
    content = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".geojson", ".json"):
        raise HTTPException(status_code=400, detail="Please upload a .geojson or .json boundary file.")
    geojson = json.loads(content.decode("utf-8"))
    features = geojson.get("features") if isinstance(geojson, dict) else None
    if not isinstance(features, list) or not features:
        raise HTTPException(status_code=400, detail="Uploaded GeoJSON contains no valid features.")

    norm_level = "zone" if level == "zone" else "woreda"
    first_props = features[0].get("properties") or {}
    guessed = nameField or next((k for k in first_props.keys() if re.search(r"woreda|adm3|adm2|zone|name", k, re.I)), next(iter(first_props.keys()), "NAME"))

    db.query(GeoBoundary).filter(GeoBoundary.level == norm_level).delete()
    rec = GeoBoundary(
        level=norm_level,
        name_field=guessed,
        feature_count=len(features),
        geojson_text=json.dumps(geojson),
        uploaded_by_name=current_user.full_name,
    )
    db.add(rec)
    db.flush()
    record_audit(
        db,
        "GEO_BOUNDARY_IMPORTED",
        "geo_boundary",
        rec.id,
        f"Imported {len(features)} {norm_level} features.",
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("geo:updated", current_user.full_name, f"Uploaded {norm_level} boundaries ({len(features)} features).")
    return JSONResponse(
        status_code=201,
        content={"id": rec.id, "level": norm_level, "nameField": guessed, "featureCount": len(features)},
    )


# ---------- Exports ----------
@app.get("/api/exports/{report_type}")
def export_report(
    report_type: str,
    format: str = "csv",
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_perm("export_reports")),
    db: Session = Depends(get_db),
):
    summary = compute_dashboard_summary(db, campaignId, dayNum, None, zone, woreda)
    rows = summary["zones"]
    headers = ["Zone", "Woredas", "Submitted", "Completeness %", "Planned Target", "Vaccinated 0-59", "Coverage %", "AFP Alerts", "AEFI Alerts"]
    table_rows = [
        [
            z["zone"],
            z["woredaCount"],
            z["submittedWoredas"],
            z["completenessPct"],
            z["plannedTarget"],
            z["vaccinated0_59"],
            z["overallCoveragePct"],
            z["afpAlerts"],
            z["aefiAlerts"],
        ]
        for z in rows
    ]

    if format == "xlsx":
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(headers)
        for tr in table_rows:
            ws.append(tr)
        buf = io.BytesIO()
        wb.save(buf)
        return Response(
            content=buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="ohb_{report_type}.xlsx"'},
        )

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(headers)
    writer.writerows(table_rows)
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="ohb_{report_type}.csv"'},
    )


# ---------- Users, Audit Logs & System Settings ----------
@app.get("/api/users")
def list_users(
    current_user: User = Depends(require_perm("manage_users")),
    db: Session = Depends(get_db),
):
    rows = db.query(User).order_by(User.id.asc()).all()
    return [serialize_user(u) for u in rows]


@app.post("/api/users")
def create_user(
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_perm("manage_users")),
    db: Session = Depends(get_db),
):
    username = (payload.get("username") or "").strip()
    full_name = (payload.get("fullName") or "").strip()
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""
    role = (payload.get("role") or "").strip()
    if not username or not full_name or not email or not password or not role:
        raise HTTPException(status_code=400, detail="All required user fields must be provided.")
    if role not in ROLE_PERMISSIONS:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
    dup = (
        db.query(User)
        .filter(
            (func.lower(User.username) == username.lower())
            | (func.lower(User.email) == email.lower())
        )
        .first()
    )
    if dup:
        raise HTTPException(
            status_code=409,
            detail="An account with that username or email already exists.",
        )
    if role == "command_room_viewer" and (
        len(password) < 10
        or not re.search(r"[A-Za-z]", password)
        or not re.search(r"[0-9!@#$%^&*]", password)
    ):
        raise HTTPException(
            status_code=400,
            detail="COMMAND_ROOM_VIEWER initial password must be at least 10 characters with letters and numbers/symbols.",
        )

    force_change = bool(payload["mustChangePassword"]) if "mustChangePassword" in payload else True
    u = User(
        username=username,
        full_name=full_name,
        email=email,
        password_hash=pwd_context.hash(password),
        role=role,
        assigned_zone=payload.get("assignedZone") or None,
        assigned_woreda=payload.get("assignedWoreda") or None,
        is_active=True,
        must_change_password=force_change,
        token_version=1,
    )
    db.add(u)
    db.flush()
    record_audit(
        db,
        "USER_CREATED",
        "user",
        u.id,
        f'Created user "{username}" with role "{role}".',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    return JSONResponse(status_code=201, content={"id": u.id})


@app.patch("/api/users/{user_id}")
def update_user(
    user_id: int,
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_perm("manage_users")),
    db: Session = Depends(get_db),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found.")
    if payload.get("role") in ROLE_PERMISSIONS:
        u.role = payload["role"]
    if "isActive" in payload:
        u.is_active = bool(payload["isActive"])
    if "assignedZone" in payload:
        u.assigned_zone = payload["assignedZone"] or None
    if "assignedWoreda" in payload:
        u.assigned_woreda = payload["assignedWoreda"] or None
    if payload.get("newPassword"):
        pw = str(payload["newPassword"])
        if u.role == "command_room_viewer" and (
            len(pw) < 10 or not re.search(r"[A-Za-z]", pw) or not re.search(r"[0-9!@#$%^&*]", pw)
        ):
            raise HTTPException(status_code=400, detail="Reset password for COMMAND_ROOM_VIEWER must meet complexity rules.")
        u.password_hash = pwd_context.hash(pw)
        u.token_version = int(getattr(u, "token_version", 1) or 1) + 1
        u.must_change_password = True
    if "mustChangePassword" in payload:
        u.must_change_password = bool(payload["mustChangePassword"])
    record_audit(
        db,
        "USER_UPDATED",
        "user",
        u.id,
        f'Updated user #{u.id} ({u.username}).',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    return {"ok": True}


@app.get("/api/audit-logs")
def list_audit_logs(
    current_user: User = Depends(require_perm("view_audit_logs")),
    db: Session = Depends(get_db),
):
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(250).all()
    return [
        {
            "id": r.id,
            "userId": r.user_id,
            "username": r.username,
            "userRole": r.user_role,
            "action": r.action,
            "entityType": r.entity_type,
            "entityId": r.entity_id,
            "details": r.details,
            "ipAddress": r.ip_address,
            "createdAt": r.created_at.isoformat() + "Z",
        }
        for r in rows
    ]


@app.get("/api/settings")
def read_settings(
    current_user: User = Depends(require_perm("manage_settings")),
    db: Session = Depends(get_db),
):
    return get_system_settings(db)


@app.put("/api/settings")
async def update_settings(
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_perm("manage_settings")),
    db: Session = Depends(get_db),
):
    updated = persist_system_settings(db, payload)
    record_audit(
        db,
        "SETTINGS_UPDATED",
        "system_settings",
        "global",
        f"Updated settings keys: {', '.join(sorted(payload.keys()))}",
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse("settings:updated", current_user.full_name, "System, branding & operational settings updated.")
    await broadcast_sse("branding:updated", current_user.full_name, "Branding appearance & identity settings updated.")
    return updated


# ---------- Full Backup, Restoration & Safe Operational Data Reset ----------
@app.get("/api/admin/backups")
def admin_list_backups(
    current_user: User = Depends(require_perm("manage_settings")),
):
    return list_backup_archives(BACKUPS_ROOT)


@app.post("/api/admin/backups")
def admin_create_backup(
    request: Request,
    current_user: User = Depends(require_perm("manage_settings")),
    db: Session = Depends(get_db),
):
    info = create_application_backup(db, UPLOAD_ROOT, BRANDING_ROOT, BACKUPS_ROOT, current_user)
    record_audit(
        db,
        "BACKUP_CREATED",
        "backup_archive",
        info["filename"],
        f'Created full backup "{info["filename"]}" ({info["fileSizeBytes"]} bytes).',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    return JSONResponse(status_code=201, content=info)


@app.get("/api/admin/backups/{filename}/download")
def admin_download_backup(
    filename: str,
    current_user: User = Depends(require_perm("manage_settings")),
):
    try:
        file_path = get_backup_archive_path(BACKUPS_ROOT, filename)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail=str(err))
    return FileResponse(file_path, media_type="application/zip", filename=os.path.basename(file_path))


@app.post("/api/admin/backups/restore")
async def admin_restore_backup(
    request: Request,
    file: Optional[UploadFile] = File(None),
    restoreScope: Optional[str] = Form(None),
    serverFilename: Optional[str] = Form(None),
    current_user: User = Depends(require_perm("manage_settings")),
    db: Session = Depends(get_db),
):
    scope = "branding_and_settings" if restoreScope == "branding_and_settings" else "full"
    zip_bytes: Optional[bytes] = None
    if file is not None:
        zip_bytes = await file.read()
    elif serverFilename:
        try:
            p = get_backup_archive_path(BACKUPS_ROOT, serverFilename)
            with open(p, "rb") as f:
                zip_bytes = f.read()
        except Exception as err:
            raise HTTPException(status_code=400, detail=str(err))
    else:
        try:
            body = await request.json()
            if isinstance(body, dict):
                if body.get("restoreScope") == "branding_and_settings":
                    scope = "branding_and_settings"
                if body.get("serverFilename"):
                    p = get_backup_archive_path(BACKUPS_ROOT, str(body["serverFilename"]))
                    with open(p, "rb") as f:
                        zip_bytes = f.read()
        except Exception:
            zip_bytes = None

    if not zip_bytes:
        raise HTTPException(status_code=400, detail="Provide a backup .zip file or serverFilename to restore.")

    try:
        res = restore_application_backup(db, zip_bytes, UPLOAD_ROOT, BRANDING_ROOT, scope)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    record_audit(
        db,
        "BACKUP_RESTORED",
        "backup_archive",
        scope,
        res["message"],
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    branding_payload = get_branding(user=current_user, db=db)
    await broadcast_sse("branding:updated", current_user.full_name, "Branding & assets restored from backup")
    await broadcast_sse("settings:updated", current_user.full_name, "System restored from backup")
    return {**res, "branding": branding_payload}


@app.post("/api/admin/operational-reset")
async def admin_operational_reset(
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_perm("manage_settings")),
    db: Session = Depends(get_db),
):
    if (payload.get("confirmationText") or "").strip() != "RESET OPERATIONAL DATA":
        raise HTTPException(
            status_code=400,
            detail='Type "RESET OPERATIONAL DATA" to confirm operational reset. Branding and system settings will be preserved.',
        )
    clear_vault = bool(payload.get("clearStoredVaultFiles", False))
    res = perform_operational_data_reset(db, clear_vault)
    record_audit(
        db,
        "OPERATIONAL_DATA_RESET",
        "system_data",
        "operational",
        f'Reset operational campaign data (reports={res["deletedReports"]}, alerts={res["deletedAlerts"]}, batches={res["deletedBatches"]}). Branding assets and system settings strictly preserved.',
        user=current_user,
        ip_address=request.client.host if request.client else "127.0.0.1",
    )
    db.commit()
    await broadcast_sse(
        "import:rolled_back",
        current_user.full_name,
        "Operational campaign records reset (branding & settings preserved).",
    )
    return res

