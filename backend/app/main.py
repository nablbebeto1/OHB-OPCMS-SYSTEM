import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import re
from fastapi import Cookie, Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import (
    AdminLocation,
    AuditLog,
    BrandingAsset,
    Campaign,
    CampaignDailyReport,
    ImportBatch,
    SurveillanceAlert,
    SystemSetting,
    User,
)
from .parser import parse_campaign_file

app = FastAPI(title=settings.APP_NAME, version="1.0.0")
settings.validate_security_config()

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

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.BRANDING_UPLOAD_DIR, exist_ok=True)
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
        "view_dashboard", "view_command_room", "upload_data", "confirm_import",
        "rollback_import", "correct_data", "manage_alerts", "export_reports",
        "manage_users", "view_audit_logs", "manage_settings", "manage_branding", "upload_geo",
    ],
    "central_command": ["view_dashboard", "view_command_room", "correct_data", "manage_alerts", "export_reports", "upload_geo"],
    "zone_officer": ["view_dashboard", "view_command_room", "correct_data", "manage_alerts", "export_reports"],
    "woreda_officer": ["view_dashboard", "view_command_room", "export_reports"],
    "viewer": ["view_dashboard", "view_command_room", "export_reports"],
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
    guest_setting = (
        db.query(SystemSetting)
        .filter(SystemSetting.key == "guestPublicOverviewEnabled")
        .first()
    )
    guest_enabled = (guest_setting.value == "true") if guest_setting else False
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
    if bool(getattr(user, "must_change_password", False)):
        navigation = []
        default_landing = "change_password"
    elif user.role == "command_room_viewer":
        navigation = []
        default_landing = "command_room"
    else:
        navigation = [item for item in NAV_MODULE_REGISTRY if item["requiredPermission"] in perms_set]
        default_landing = "live_command_center"

    return {
        "authenticated": True,
        "user": serialize_user(user),
        "permissions": perms,
        "navigation": navigation,
        "defaultLanding": default_landing,
        "guestPublicOverviewEnabled": guest_enabled,
    }


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


def require_dashboard_access(user: User = Depends(require_authenticated)) -> User:
    if user.role == "command_room_viewer":
        raise HTTPException(status_code=403, detail="Command Room Viewer is restricted to /command-room")
    return user


def require_upload_access(user: User = Depends(require_authenticated)) -> User:
    if user.role != "system_admin":
        raise HTTPException(status_code=403, detail="Only System Administrator can upload campaign files")
    return user


def require_admin_access(user: User = Depends(require_authenticated)) -> User:
    if user.role != "system_admin":
        raise HTTPException(status_code=403, detail="System Administrator access required")
    return user


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ohb-opcms-fastapi"}


@app.get("/api/branding")
def get_branding(
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    logo = (
        db.query(BrandingAsset)
        .filter(BrandingAsset.asset_type == "logo", BrandingAsset.is_active == True)
        .order_by(BrandingAsset.id.desc())
        .first()
    )
    favicon = (
        db.query(BrandingAsset)
        .filter(BrandingAsset.asset_type == "favicon", BrandingAsset.is_active == True)
        .order_by(BrandingAsset.id.desc())
        .first()
    )
    payload: Dict[str, Any] = {
        "logoUrl": f"/api/branding/logo?v={logo.id}" if logo else None,
        "faviconUrl": f"/api/branding/favicon?v={favicon.id}" if favicon else None,
        "hasCustomLogo": logo is not None,
        "hasCustomFavicon": favicon is not None,
        "logoMeta": None,
        "faviconMeta": None,
        "updatedAt": (logo.uploaded_at if logo else favicon.uploaded_at if favicon else datetime.utcnow()).isoformat() + "Z",
    }
    if user and user.role == "system_admin":
        hist = db.query(BrandingAsset).order_by(BrandingAsset.id.desc()).limit(20).all()
        payload["history"] = [
            {
                "id": h.id,
                "assetType": h.asset_type,
                "originalFilename": h.original_filename,
                "mimeType": h.mime_type,
                "fileSizeBytes": h.file_size_bytes,
                "isActive": h.is_active,
                "uploadedByName": h.uploaded_by_name,
                "uploadedAt": h.uploaded_at.isoformat() + "Z",
            }
            for h in hist
        ]
    return payload


@app.get("/api/branding/logo")
def serve_logo(db: Session = Depends(get_db)):
    logo = (
        db.query(BrandingAsset)
        .filter(BrandingAsset.asset_type == "logo", BrandingAsset.is_active == True)
        .order_by(BrandingAsset.id.desc())
        .first()
    )
    if not logo or not os.path.exists(logo.stored_path):
        raise HTTPException(status_code=404, detail="No custom logo configured")
    headers = {"X-Content-Type-Options": "nosniff"}
    if logo.mime_type == "image/svg+xml":
        headers["Content-Security-Policy"] = "sandbox"
    return FileResponse(logo.stored_path, media_type=logo.mime_type, headers=headers)


@app.get("/api/branding/favicon")
def serve_favicon(db: Session = Depends(get_db)):
    fav = (
        db.query(BrandingAsset)
        .filter(BrandingAsset.asset_type == "favicon", BrandingAsset.is_active == True)
        .order_by(BrandingAsset.id.desc())
        .first()
    )
    if not fav or not os.path.exists(fav.stored_path):
        return Response(content=DEFAULT_FAVICON_SVG, media_type="image/svg+xml")
    headers = {"X-Content-Type-Options": "nosniff"}
    if fav.mime_type == "image/svg+xml":
        headers["Content-Security-Policy"] = "sandbox"
    return FileResponse(fav.stored_path, media_type=fav.mime_type, headers=headers)


@app.post("/api/admin/branding/{asset_type}")
async def upload_branding_asset(
    asset_type: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    if asset_type not in ("logo", "favicon"):
        raise HTTPException(status_code=400, detail="Invalid asset type")
    content = await file.read()
    ext = os.path.splitext(os.path.basename(file.filename or ""))[1].lower()
    allowed_exts = {".png", ".jpg", ".jpeg", ".svg", ".webp"} if asset_type == "logo" else {".ico", ".png", ".svg"}
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported {asset_type} format")
    if len(content) > (5 * 1024 * 1024 if asset_type == "logo" else 2 * 1024 * 1024):
        raise HTTPException(status_code=400, detail="File exceeds maximum size")
    if ext == ".svg":
        text = content.decode("utf-8", errors="ignore")
        if re.search(r"<script|<foreignObject|javascript:|on[a-z]+\s*=", text, re.I):
            raise HTTPException(status_code=400, detail="Unsafe SVG content rejected")

    unique_name = f"{asset_type}_{uuid.uuid4().hex[:12]}{ext}"
    stored_path = os.path.abspath(os.path.join(settings.BRANDING_UPLOAD_DIR, unique_name))
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
        is_active=True,
        uploaded_by_user_id=current_user.id,
        uploaded_by_name=current_user.full_name,
    )
    db.add(rec)
    db.commit()
    await broadcast_sse("branding:updated", current_user.full_name, f"Updated system {asset_type}")
    return get_branding(user=current_user, db=db)


@app.delete("/api/admin/branding/{asset_type}")
async def delete_branding_asset(
    asset_type: str,
    current_user: User = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    if asset_type not in ("logo", "favicon"):
        raise HTTPException(status_code=400, detail="Invalid asset type")
    db.query(BrandingAsset).filter(
        BrandingAsset.asset_type == asset_type, BrandingAsset.is_active == True
    ).update({"is_active": False})
    db.commit()
    await broadcast_sse("branding:updated", current_user.full_name, f"Removed system {asset_type}")
    return get_branding(user=current_user, db=db)


@app.get("/api/events")
async def sse_events(current_user: User = Depends(require_authenticated)):
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
        db.add(
            AuditLog(
                username=username or "anonymous",
                user_role="viewer",
                action="LOGIN_FAILED",
                entity_type="user",
                entity_id=username or "unknown",
                details=f'Failed login attempt for "{username}".',
                ip_address=request.client.host if request.client else "127.0.0.1",
            )
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    user.last_login_at = datetime.utcnow()
    db.add(
        AuditLog(
            user_id=user.id,
            username=user.username,
            user_role=user.role,
            action="LOGIN_SUCCESS",
            entity_type="user",
            entity_id=str(user.id),
            details=f'User "{user.username}" ({user.role}) signed in.',
            ip_address=request.client.host if request.client else "127.0.0.1",
        )
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
        db.add(
            AuditLog(
                user_id=user.id,
                username=user.username,
                user_role=user.role,
                action="LOGOUT",
                entity_type="user",
                entity_id=str(user.id),
                details=f'User "{user.username}" signed out.',
                ip_address=request.client.host if request.client else "127.0.0.1",
            )
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
    db.add(
        AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            user_role=current_user.role,
            action="PASSWORD_CHANGED",
            entity_type="user",
            entity_id=str(current_user.id),
            details=f'User "{current_user.username}" changed password and invalidated prior tokens.',
            ip_address=request.client.host if request.client else "127.0.0.1",
        )
    )
    db.commit()
    response.delete_cookie(key="opcms_token", path="/")
    return {
        "ok": True,
        "requiresRelogin": True,
        "message": "Password changed successfully. Please sign in again with your new password.",
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
    stored_path = os.path.join(settings.UPLOAD_DIR, f"{staging_id}_{safe_name}")
    with open(stored_path, "wb") as f:
        f.write(content)

    parsed = parse_campaign_file(content, safe_name)
    STAGING_STORE[staging_id] = {
        "campaign_id": campaignId,
        "original_filename": safe_name,
        "stored_path": stored_path,
        "file_size_bytes": len(content),
        "parsed": parsed,
    }
    return {
        "stagingId": staging_id,
        "originalFilename": safe_name,
        "totalRowsDetected": len(parsed["rows"]),
        "totalSummaryRowsSkipped": parsed["total_summary_rows_skipped"],
        "issues": parsed["issues"],
    }


@app.post("/api/imports/confirm")
async def confirm_import(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_upload_access),
):
    staging_id = payload.get("stagingId")
    staged = STAGING_STORE.pop(staging_id, None)
    if not staged:
        raise HTTPException(status_code=404, detail="Staging session not found")

    import_mode = payload.get("importMode", "incremental_skip")
    parsed = staged["parsed"]

    batch = ImportBatch(
        campaign_id=staged["campaign_id"],
        original_filename=staged["original_filename"],
        stored_path=staged["stored_path"],
        file_size_bytes=staged["file_size_bytes"],
        file_format=staged["original_filename"].rsplit(".", 1)[-1].lower(),
        detected_template="Oromia SIA Daily Admin Report",
        import_mode=import_mode,
        validation_status="passed",
        detected_records=len(parsed["rows"]),
        uploaded_by_name=payload.get("uploadedByName", "System Officer"),
        confirmed_at=datetime.utcnow(),
        status="confirmed",
    )
    db.add(batch)
    db.flush()

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
    db.commit()

    await broadcast_sse(
        "import:confirmed",
        batch.uploaded_by_name,
        f"Imported {batch.original_filename} ({imported} new, {updated} updated)",
    )
    return {"id": batch.id, "imported": imported, "updated": updated, "skipped": skipped}


@app.post("/api/imports/{batch_id}/rollback")
async def rollback_import(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_access),
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
    db.commit()

    await broadcast_sse(
        "import:rolled_back",
        "System Admin",
        f"Import batch #{batch_id} rolled back",
    )
    return {"ok": True, "batchId": batch_id}


@app.get("/api/analytics/advanced")
def get_advanced_analytics(
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_dashboard_access),
    db: Session = Depends(get_db),
):
    latest_batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.campaign_id == campaignId, ImportBatch.status == "confirmed")
        .order_by(ImportBatch.confirmed_at.desc(), ImportBatch.id.desc())
        .first()
    )

    query = db.query(CampaignDailyReport).filter(
        CampaignDailyReport.campaign_id == campaignId,
        CampaignDailyReport.is_active == True,
    )
    if dayNum:
        query = query.filter(CampaignDailyReport.campaign_day_num == dayNum)
    if zone:
        query = query.filter(CampaignDailyReport.canonical_zone == zone)
    if woreda:
        query = query.filter(CampaignDailyReport.canonical_woreda == woreda)

    rows = query.all()
    baseline_locs = db.query(AdminLocation).filter(AdminLocation.is_active == True).all()
    if zone:
        baseline_locs = [l for l in baseline_locs if l.canonical_zone == zone]
    if woreda:
        baseline_locs = [l for l in baseline_locs if l.canonical_woreda == woreda]

    planned_target = sum(l.planned_target for l in baseline_locs)
    total_vacc_0_59 = sum(r.total_vaccinated_0_59 for r in rows)
    v0_11_b = sum(r.vacc_0_11_before for r in rows)
    v0_11_nb = sum(r.vacc_0_11_not_before for r in rows)
    v12_59_b = sum(r.vacc_12_59_before for r in rows)
    v12_59_nb = sum(r.vacc_12_59_not_before for r in rows)
    v60_120_b = sum(r.vacc_60_120_before for r in rows)
    v60_120_nb = sum(r.vacc_60_120_not_before for r in rows)

    total_before = v0_11_b + v12_59_b + v60_120_b
    total_not_before = v0_11_nb + v12_59_nb + v60_120_nb
    zd_id = sum(r.zd_identified_linked for r in rows)
    zd_v = sum(r.zd_vaccinated for r in rows)
    uv_id = sum(r.uv_identified_linked for r in rows)
    uv_v = sum(r.uv_vaccinated for r in rows)
    teams_tot = sum(r.teams_total for r in rows)
    teams_rep = sum(r.teams_reported for r in rows)

    return {
        "latestImport": {
            "id": latest_batch.id,
            "originalFilename": latest_batch.original_filename,
            "confirmedAt": latest_batch.confirmed_at.isoformat() if latest_batch.confirmed_at else "",
            "uploadedByName": latest_batch.uploaded_by_name,
            "detectedRecords": latest_batch.detected_records,
            "importedRecords": latest_batch.imported_records,
            "updatedRecords": latest_batch.updated_records,
            "importMode": latest_batch.import_mode,
        }
        if latest_batch
        else None,
        "serverTimestamp": datetime.utcnow().isoformat() + "Z",
        "vaccinationPerformance": {
            "totalPlannedTarget": planned_target,
            "totalVaccinated0_59": total_vacc_0_59,
            "totalVaccinated60_120": v60_120_b + v60_120_nb,
            "remainingTarget": max(0, planned_target - total_vacc_0_59),
            "cumulativeVaccinationCoveragePct": round((total_vacc_0_59 / planned_target) * 100, 1)
            if planned_target > 0
            else 0,
        },
        "ageGroups": {
            "age0_11Before": v0_11_b,
            "age0_11NotBefore": v0_11_nb,
            "age0_11Total": v0_11_b + v0_11_nb,
            "age12_59Before": v12_59_b,
            "age12_59NotBefore": v12_59_nb,
            "age12_59Total": v12_59_b + v12_59_nb,
            "age60_120Before": v60_120_b,
            "age60_120NotBefore": v60_120_nb,
            "age60_120Total": v60_120_b + v60_120_nb,
            "totalVaccinatedBefore": total_before,
            "totalNotVaccinatedBefore": total_not_before,
        },
        "integrationMetrics": {
            "zdIdentified": zd_id,
            "zdVaccinated": zd_v,
            "zdConversionPct": round((zd_v / zd_id) * 100, 1) if zd_id > 0 else 0,
            "uvIdentified": uv_id,
            "uvVaccinated": uv_v,
            "uvConversionPct": round((uv_v / uv_id) * 100, 1) if uv_id > 0 else 0,
            "smHhsVisited": sum(r.sm_hhs_visited for r in rows),
            "smGroupDiscussions": sum(r.sm_group_discussions for r in rows),
            "smIpcReached": sum(r.sm_ipc_reached for r in rows),
            "teamsTotal": teams_tot,
            "teamsReported": teams_rep,
            "teamsReportingPct": round((teams_rep / teams_tot) * 100, 1) if teams_tot > 0 else 0,
        },
    }


@app.get("/api/command-room/state")
def get_command_room_state(
    campaignId: int = 1,
    dayNum: Optional[int] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
    current_user: User = Depends(require_authenticated),
    db: Session = Depends(get_db),
):
    adv = get_advanced_analytics(
        campaignId=campaignId, dayNum=dayNum, zone=zone, woreda=woreda, current_user=current_user, db=db
    )
    setting_rows = {s.key: s.value for s in db.query(SystemSetting).all()}
    return {
        **adv,
        "settings": {
            "coverageTargetPct": float(setting_rows.get("coverageTargetPct", 95)),
            "coverageCriticalPct": float(setting_rows.get("coverageCriticalPct", 80)),
            "maxWastagePct": float(setting_rows.get("maxWastagePct", 15)),
            "commandRoomAutoRotate": setting_rows.get("commandRoomAutoRotate", "true") != "false",
            "commandRoomIntervalSec": int(setting_rows.get("commandRoomIntervalSec", 15)),
            "commandRoomEnabledScreens": [
                int(x)
                for x in setting_rows.get("commandRoomEnabledScreens", "1,2,3,4,5").split(",")
                if x.strip().isdigit()
            ],
            "commandRoomDefaultScreen": int(setting_rows.get("commandRoomDefaultScreen", 1)),
            "commandRoomFullscreenStartup": setting_rows.get("commandRoomFullscreenStartup", "false") == "true",
            "commandRoomDataRefreshSec": int(setting_rows.get("commandRoomDataRefreshSec", 30)),
            "commandRoomDisplayTitle": setting_rows.get(
                "commandRoomDisplayTitle",
                "Oromia Health Bureau – Polio Campaign Command Room",
            ),
        },
    }
