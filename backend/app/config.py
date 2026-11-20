import logging
from typing import List
from pydantic_settings import BaseSettings

logger = logging.getLogger("ohb-opcms.config")

INSECURE_SECRET_PLACEHOLDERS = {
    "",
    "change-this-to-a-long-random-hex-secret",
    "change-this-to-a-long-random-secret",
    "replace-with-openssl-rand-hex-32-secret",
    "secret",
    "changeme",
}


class Settings(BaseSettings):
    APP_NAME: str = "Oromia Polio Campaign Management System (OHB-OPCMS)"
    ENVIRONMENT: str = "development"
    APP_DOMAIN: str = "https://polio.orhb.gov.et"
    PUBLIC_APP_URL: str = ""
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 4949
    FRONTEND_HOST: str = "127.0.0.1"
    FRONTEND_PORT: int = 1119

    POSTGRES_HOST: str = "127.0.0.1"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "ohb_opcms"
    POSTGRES_USER: str = "opcms_user"
    POSTGRES_PASSWORD: str = "change_me_in_production"

    SECRET_KEY: str = "change-this-to-a-long-random-hex-secret"
    FILE_PREVIEW_SECRET: str = ""
    PREVIEW_LINK_TTL_HOURS: int = 144

    CORS_ORIGINS: str = (
        "https://polio.orhb.gov.et,"
        "http://196.188.173.157:1119,"
        "http://192.168.100.11:1119,"
        "http://127.0.0.1:1119,"
        "http://localhost:1119,"
        "http://localhost:3000,"
        "http://127.0.0.1:3000"
    )
    UPLOAD_DIR: str = "/var/lib/ohb-opcms/uploads"
    BRANDING_UPLOAD_DIR: str = "/var/lib/ohb-opcms/uploads/branding"
    MAX_UPLOAD_SIZE_MB: int = 25

    OPCMS_INIT_ADMIN_USERNAME: str = "Admin"
    OPCMS_INIT_ADMIN_PASSWORD: str = ""
    OPCMS_INIT_ADMIN_EMAIL: str = "admin@oromiahealth.gov.et"
    OPCMS_INIT_COMMAND_USERNAME: str = "OHBPHEM"
    OPCMS_INIT_COMMAND_PASSWORD: str = ""
    OPCMS_INIT_COMMAND_EMAIL: str = "ohbphem@oromiahealth.gov.et"
    OPCMS_FORCE_SYNC_INIT_ACCOUNTS: bool = False

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def effective_preview_secret(self) -> str:
        custom = (self.FILE_PREVIEW_SECRET or "").strip()
        return custom if custom else (self.SECRET_KEY or "").strip()

    @property
    def effective_public_url(self) -> str:
        candidate = (self.PUBLIC_APP_URL or self.APP_DOMAIN or "").strip().rstrip("/")
        return candidate

    def is_secret_key_configured(self) -> bool:
        val = (self.SECRET_KEY or "").strip()
        return len(val) >= 32 and val not in INSECURE_SECRET_PLACEHOLDERS

    def validate_security_config(self) -> None:
        if not self.is_secret_key_configured():
            msg = (
                "SECRET_KEY is missing, shorter than 32 characters, or set to the default placeholder. "
                "Configure a cryptographically random SECRET_KEY in /opt/ohb-opcms/.env."
            )
            if self.ENVIRONMENT.strip().lower() == "production":
                raise RuntimeError(msg)
            logger.warning(msg)

        preview_sec = self.effective_preview_secret
        if len(preview_sec) < 32 or preview_sec in INSECURE_SECRET_PLACEHOLDERS:
            msg = (
                "FILE_PREVIEW_SECRET/SECRET_KEY is not securely configured for signed preview URLs."
            )
            if self.ENVIRONMENT.strip().lower() == "production":
                raise RuntimeError(msg)
            logger.warning(msg)

    class Config:
        env_file = (".env", "../.env")
        extra = "ignore"


settings = Settings()
