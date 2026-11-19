from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "Oromia Polio Campaign Management System (OHB-OPCMS)"
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
    CORS_ORIGINS: str = (
        "https://polio.orhb.gov.et,"
        "http://196.188.173.157:1119,"
        "http://192.168.100.11:1119,"
        "http://127.0.0.1:1119,"
        "http://localhost:3000,"
        "http://127.0.0.1:3000"
    )
    UPLOAD_DIR: str = "/var/lib/ohb-opcms/uploads"
    BRANDING_UPLOAD_DIR: str = "/opt/ohb-opcms/backend/uploads/branding"
    MAX_UPLOAD_SIZE_MB: int = 25

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
