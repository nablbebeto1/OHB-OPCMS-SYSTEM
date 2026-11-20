import logging
from typing import Dict

from passlib.context import CryptContext
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from .models import User

logger = logging.getLogger("ohb-opcms.provision")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def provision_configured_accounts(
    db: Session,
    *,
    force_sync: bool = False,
) -> Dict[str, str]:
    specs = [
        {
            "username": (settings.OPCMS_INIT_ADMIN_USERNAME or "Admin").strip(),
            "full_name": "OHB System Administrator",
            "email": (settings.OPCMS_INIT_ADMIN_EMAIL or "admin@oromiahealth.gov.et").strip(),
            "password": settings.OPCMS_INIT_ADMIN_PASSWORD or "",
            "role": "system_admin",
        },
        {
            "username": (settings.OPCMS_INIT_COMMAND_USERNAME or "OHBPHEM").strip(),
            "full_name": "Oromia PHEM Central Command Center",
            "email": (settings.OPCMS_INIT_COMMAND_EMAIL or "ohbphem@oromiahealth.gov.et").strip(),
            "password": settings.OPCMS_INIT_COMMAND_PASSWORD or "",
            "role": "command_center",
        },
    ]

    summary: Dict[str, str] = {}
    effective_force = bool(force_sync or settings.OPCMS_FORCE_SYNC_INIT_ACCOUNTS)

    for spec in specs:
        username = spec["username"]
        password = spec["password"]
        role = spec["role"]

        existing = (
            db.query(User)
            .filter(func.lower(User.username) == username.lower())
            .first()
        )
        if existing:
            should_sync_pw = bool(password) and (
                effective_force
                or (role == "system_admin" and existing.username != username)
            )
            existing.username = username
            existing.role = role
            existing.is_active = True
            if should_sync_pw:
                existing.password_hash = pwd_context.hash(password)
                existing.must_change_password = True
                existing.token_version = int(getattr(existing, "token_version", 1) or 1) + 1
                summary[username] = "updated_credentials_and_role"
            else:
                summary[username] = "preserved"
            continue

        if not password:
            logger.warning(
                "Initial password environment variable is not set for '%s'; skipping creation.",
                username,
            )
            summary[username] = "skipped_no_env_password"
            continue

        user = User(
            username=username,
            full_name=spec["full_name"],
            email=spec["email"],
            password_hash=pwd_context.hash(password),
            role=role,
            assigned_zone=None,
            assigned_woreda=None,
            is_active=True,
            must_change_password=True,
            token_version=1,
        )
        db.add(user)
        summary[username] = "created"

    db.commit()
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db = SessionLocal()
    try:
        res = provision_configured_accounts(db, force_sync=True)
        print("Provisioned accounts:", res)
    finally:
        db.close()
