import base64
import csv
import hashlib
import hmac
import io
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .config import settings
from .models import FilePreviewLink, StoredFile, User

ALLOWED_FILE_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",
    ".xlsx",
    ".xls",
    ".csv",
    ".docx",
    ".doc",
    ".txt",
    ".json",
    ".zip",
}

BLOCKED_EXECUTABLE_EXTENSIONS = {
    ".exe",
    ".sh",
    ".bash",
    ".bat",
    ".cmd",
    ".msi",
    ".php",
    ".py",
    ".rb",
    ".pl",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".html",
    ".htm",
    ".ps1",
    ".vbs",
    ".jar",
    ".dll",
    ".so",
    ".dylib",
    ".elf",
    ".bin",
}

EXT_DEFAULT_MIME = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".csv": "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".txt": "text/plain",
    ".json": "application/json",
    ".zip": "application/zip",
}

ALLOWED_CATEGORIES = {
    "campaign_reports",
    "surveillance_docs",
    "sop_guidelines",
    "microplans",
    "general",
}


def ensure_storage_directories() -> str:
    root = os.path.abspath(settings.UPLOAD_DIR)
    for sub in ("imports", "branding", "documents", "geo", "staging"):
        os.makedirs(os.path.join(root, sub), exist_ok=True)
    return root


def sanitize_filename(raw_name: str) -> str:
    base = os.path.basename(raw_name or "file")
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "_", base).strip("._")
    return cleaned[:180] if cleaned else "document"


def sanitize_segment(value: str, fallback: str = "general") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", (value or "").strip().lower())
    return cleaned[:60] if cleaned else fallback


def validate_uploaded_file(content: bytes, filename: str, declared_mime: Optional[str]) -> Tuple[str, str]:
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    safe_base = os.path.basename(filename or "")
    ext = os.path.splitext(safe_base)[1].lower()
    if ext in BLOCKED_EXECUTABLE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Executable or script files are strictly prohibited.")
    if ext not in ALLOWED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext or 'unknown'}'. Allowed: PDF, PNG, JPG, WebP, GIF, SVG, XLSX, XLS, CSV, DOCX, DOC, TXT, JSON, ZIP.",
        )

    if ext == ".pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Invalid PDF signature (%PDF- header missing).")
    if ext == ".png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="Invalid PNG image file.")
    if ext in (".jpg", ".jpeg") and not content.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail="Invalid JPEG image file.")
    if ext == ".gif" and not (content.startswith(b"GIF87a") or content.startswith(b"GIF89a")):
        raise HTTPException(status_code=400, detail="Invalid GIF image file.")
    if ext == ".webp" and not (len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"):
        raise HTTPException(status_code=400, detail="Invalid WebP image file.")
    if ext in (".xlsx", ".docx", ".zip") and not content.startswith(b"PK"):
        raise HTTPException(status_code=400, detail=f"Invalid {ext.upper()} archive signature.")
    if ext == ".svg":
        text = content.decode("utf-8", errors="ignore")
        if "<svg" not in text.lower() or "</svg>" not in text.lower():
            raise HTTPException(status_code=400, detail="Invalid SVG file.")
        if re.search(r"<script|<foreignObject|javascript:|vbscript:|on[a-z]+\s*=", text, re.I):
            raise HTTPException(status_code=400, detail="Rejected SVG containing active scripts or event handlers.")

    normalized_mime = EXT_DEFAULT_MIME.get(ext) or (declared_mime or "application/octet-stream").split(";")[0].strip()
    return ext, normalized_mime


def save_permanent_file(
    db: Session,
    content: bytes,
    original_filename: str,
    declared_mime: Optional[str],
    user: User,
    module: str = "documents",
    category: str = "general",
    description: str = "",
    associated_record_type: Optional[str] = None,
    associated_record_id: Optional[int] = None,
) -> StoredFile:
    root = ensure_storage_directories()
    ext, mime_type = validate_uploaded_file(content, original_filename, declared_mime)

    safe_module = sanitize_segment(module, "documents")
    safe_category = sanitize_segment(category, "general")
    if safe_module == "documents" and safe_category not in ALLOWED_CATEGORIES:
        safe_category = "general"

    now = datetime.utcnow()
    subdir_parts = (
        [safe_module, safe_category, f"{now.year:04d}", f"{now.month:02d}"]
        if safe_module == "documents"
        else [safe_module, f"{now.year:04d}", f"{now.month:02d}"]
    )
    target_dir = os.path.abspath(os.path.join(root, *subdir_parts))
    if not target_dir.startswith(os.path.realpath(root) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid storage subdirectory.")
    os.makedirs(target_dir, exist_ok=True)

    file_uuid = str(uuid.uuid4())
    clean_base = sanitize_filename(os.path.splitext(original_filename)[0])
    stored_filename = f"{file_uuid}_{clean_base}{ext}"
    abs_path = os.path.abspath(os.path.join(target_dir, stored_filename))
    if not abs_path.startswith(os.path.realpath(root) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid target storage path.")

    with open(abs_path, "wb") as f:
        f.write(content)

    sha256 = hashlib.sha256(content).hexdigest()
    rel_path = os.path.relpath(abs_path, root).replace("\\", "/")

    rec = StoredFile(
        file_uuid=file_uuid,
        original_filename=os.path.basename(original_filename or stored_filename)[:300],
        stored_filename=stored_filename,
        extension=ext,
        mime_type=mime_type,
        file_size_bytes=len(content),
        sha256_checksum=sha256,
        module=safe_module,
        category=safe_category,
        associated_record_type=associated_record_type,
        associated_record_id=associated_record_id,
        description=(description or "").strip(),
        relative_path=rel_path,
        storage_path=abs_path,
        uploaded_by_user_id=user.id,
        uploaded_by_name=user.full_name,
        uploaded_at=now,
        is_active=True,
    )
    db.add(rec)
    db.flush()
    return rec


def resolve_safe_storage_path(rec: StoredFile) -> str:
    root = os.path.realpath(ensure_storage_directories())
    candidate = os.path.realpath(rec.storage_path)
    if not candidate.startswith(root + os.sep):
        rel_candidate = os.path.realpath(os.path.join(root, rec.relative_path.lstrip("/")))
        if not rel_candidate.startswith(root + os.sep):
            raise HTTPException(status_code=403, detail="Access outside permanent storage root denied.")
        candidate = rel_candidate
    if not os.path.isfile(candidate):
        raise HTTPException(status_code=404, detail="Stored file is missing from permanent storage.")
    return candidate


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _sign_preview_message(token_id: str, file_id: int, exp_unix: int) -> str:
    secret = settings.effective_preview_secret.encode("utf-8")
    msg = f"{token_id}:{file_id}:{exp_unix}:readonly".encode("utf-8")
    digest = hmac.new(secret, msg, hashlib.sha256).digest()
    return _b64url_encode(digest)


def resolve_public_base_url(request: Request) -> str:
    configured = settings.effective_public_url
    if configured and "127.0.0.1" not in configured and "localhost" not in configured:
        return configured

    xf_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    xf_host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    host = xf_host or (request.headers.get("host") or "").strip()
    if host:
        is_local = host.startswith("127.0.0.1") or host.startswith("localhost")
        scheme = xf_proto if xf_proto in ("http", "https") else ("http" if is_local else "https")
        return f"{scheme}://{host}".rstrip("/")

    return configured or "https://polio.orhb.gov.et"


def format_preview_token(token_id: str, file_id: int, exp_unix: int, sig: str) -> str:
    return f"{token_id}.{file_id}.{exp_unix}.{sig}"


def create_preview_link(
    db: Session,
    stored_file: StoredFile,
    user: User,
    request: Request,
) -> Dict[str, Any]:
    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    ttl_hours = int(settings.PREVIEW_LINK_TTL_HOURS or 144)
    expires_at_utc = now + timedelta(hours=ttl_hours)
    exp_unix = int(expires_at_utc.timestamp())
    token_id = secrets.token_hex(16)
    sig = _sign_preview_message(token_id, stored_file.id, exp_unix)

    link = FilePreviewLink(
        file_id=stored_file.id,
        token_id=token_id,
        signature_hmac=sig,
        expires_at=expires_at_utc.replace(tzinfo=None),
        is_revoked=False,
        created_by_user_id=user.id,
        created_by_name=user.full_name,
        created_at=now.replace(tzinfo=None),
        access_count=0,
    )
    db.add(link)
    db.flush()

    token = format_preview_token(token_id, stored_file.id, exp_unix, sig)
    base_url = resolve_public_base_url(request)
    return serialize_preview_link(link, token, base_url, ttl_hours)


def serialize_preview_link(
    link: FilePreviewLink,
    token: str,
    base_url: str,
    ttl_hours: int = 144,
) -> Dict[str, Any]:
    exp_iso = link.expires_at.isoformat() + "Z"
    created_iso = link.created_at.isoformat() + "Z"
    return {
        "id": link.id,
        "fileId": link.file_id,
        "tokenId": link.token_id,
        "token": token,
        "previewUrl": f"{base_url}/preview/{token}",
        "contentUrl": f"{base_url}/api/files/preview/{token}/content",
        "expiresAt": exp_iso,
        "ttlHours": ttl_hours,
        "isRevoked": bool(link.is_revoked),
        "revokedAt": link.revoked_at.isoformat() + "Z" if link.revoked_at else None,
        "revokedByName": link.revoked_by_name,
        "revokeReason": link.revoke_reason,
        "createdByName": link.created_by_name,
        "createdAt": created_iso,
        "lastAccessedAt": link.last_accessed_at.isoformat() + "Z" if link.last_accessed_at else None,
        "accessCount": int(link.access_count or 0),
    }


def verify_preview_token(
    db: Session,
    token: str,
    increment_access: bool = False,
) -> Tuple[StoredFile, FilePreviewLink]:
    parts = (token or "").strip().split(".")
    if len(parts) != 4:
        raise HTTPException(status_code=401, detail="Invalid preview link token format.")
    token_id, file_id_str, exp_str, sig = parts
    try:
        file_id = int(file_id_str)
        exp_unix = int(exp_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Malformed preview link parameters.")

    expected_sig = _sign_preview_message(token_id, file_id, exp_unix)
    if not hmac.compare_digest(expected_sig, sig):
        raise HTTPException(status_code=401, detail="Preview link signature verification failed.")

    now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)
    if int(now_utc.timestamp()) >= exp_unix:
        raise HTTPException(
            status_code=410,
            detail="This 6-day (144-hour) live preview link has expired.",
        )

    link = (
        db.query(FilePreviewLink)
        .filter(FilePreviewLink.token_id == token_id, FilePreviewLink.file_id == file_id)
        .first()
    )
    if not link or not hmac.compare_digest(link.signature_hmac, sig):
        raise HTTPException(status_code=401, detail="Preview link record could not be verified.")

    if link.is_revoked:
        raise HTTPException(
            status_code=403,
            detail="This preview link has been revoked by an administrator.",
        )

    if now_utc.replace(tzinfo=None) >= link.expires_at:
        raise HTTPException(
            status_code=410,
            detail="This 6-day (144-hour) live preview link has expired.",
        )

    rec = (
        db.query(StoredFile)
        .filter(StoredFile.id == file_id, StoredFile.is_active == True)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Associated file is no longer available.")

    # Verify file exists inside permanent root before acknowledging access
    resolve_safe_storage_path(rec)

    if increment_access:
        link.access_count = int(link.access_count or 0) + 1
        link.last_accessed_at = now_utc.replace(tzinfo=None)
        db.commit()

    return rec, link


def detect_preview_kind(ext: str, mime_type: str) -> str:
    e = ext.lower()
    m = (mime_type or "").lower()
    if e == ".pdf" or m == "application/pdf":
        return "pdf"
    if e in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg") or m.startswith("image/"):
        return "image"
    if e in (".csv", ".xlsx", ".xls"):
        return "spreadsheet"
    if e in (".txt", ".json"):
        return "text"
    return "document"


def serialize_stored_file(
    rec: StoredFile,
    links: Optional[List[FilePreviewLink]] = None,
    base_url: str = "",
) -> Dict[str, Any]:
    now_naive = datetime.utcnow()
    link_items = []
    active_count = 0
    for lnk in (links or []):
        exp_unix = int(lnk.expires_at.replace(tzinfo=timezone.utc).timestamp())
        tok = format_preview_token(lnk.token_id, lnk.file_id, exp_unix, lnk.signature_hmac)
        if not lnk.is_revoked and lnk.expires_at > now_naive:
            active_count += 1
        link_items.append(
            serialize_preview_link(lnk, tok, base_url, int(settings.PREVIEW_LINK_TTL_HOURS or 144))
        )

    return {
        "id": rec.id,
        "fileUuid": rec.file_uuid,
        "originalFilename": rec.original_filename,
        "storedFilename": rec.stored_filename,
        "extension": rec.extension,
        "mimeType": rec.mime_type,
        "fileSizeBytes": rec.file_size_bytes,
        "sha256Checksum": rec.sha256_checksum,
        "module": rec.module,
        "category": rec.category,
        "associatedRecordType": rec.associated_record_type,
        "associatedRecordId": rec.associated_record_id,
        "description": rec.description,
        "uploadedByName": rec.uploaded_by_name,
        "uploadedAt": rec.uploaded_at.isoformat() + "Z",
        "previewKind": detect_preview_kind(rec.extension, rec.mime_type),
        "activePreviewLinksCount": active_count,
        "previewLinks": link_items,
    }


def extract_spreadsheet_preview(file_path: str, ext: str, max_rows: int = 120, max_cols: int = 40) -> Dict[str, Any]:
    sheets: List[Dict[str, Any]] = []
    if ext == ".csv":
        with open(file_path, "r", encoding="utf-8", errors="replace", newline="") as f:
            reader = csv.reader(f)
            rows = []
            for idx, r in enumerate(reader):
                if idx >= max_rows:
                    break
                rows.append([str(c)[:200] for c in r[:max_cols]])
            sheets.append({"name": "CSV Data", "rows": rows, "truncated": len(rows) >= max_rows})
    elif ext == ".xlsx":
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        for name in wb.sheetnames[:5]:
            ws = wb[name]
            rows = []
            for idx, row in enumerate(ws.iter_rows(values_only=True)):
                if idx >= max_rows:
                    break
                rows.append(["" if c is None else str(c)[:200] for c in row[:max_cols]])
            sheets.append({"name": name, "rows": rows, "truncated": len(rows) >= max_rows})
        wb.close()
    return {"sheets": sheets}
