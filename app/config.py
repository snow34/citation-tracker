from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _ensure_asyncpg_driver(url: str) -> str:
    """Some hosts (Render, Railway, Heroku-style) inject a bare postgres:// or
    postgresql:// connection string. SQLAlchemy's async engine needs the asyncpg
    driver spelled out, so normalize it here rather than requiring manual editing."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/citation_tracker"
    test_database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/citation_tracker_test"
    )

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    crossref_base_url: str = "https://api.crossref.org"
    crossref_mailto: str = "you@example.com"

    # Comma-separated list of allowed CORS origins, or "*" for any. Safe as a wildcard
    # default since auth is bearer-JWT (no cookies), but tighten once a frontend exists.
    allowed_origins: str = "*"

    # Resend (https://resend.com) sends the password-reset email. The onboarding sender
    # works with no domain/DNS setup — replace once a verified sending domain exists.
    resend_api_key: str = ""
    resend_from_email: str = "Citation Tracker <onboarding@resend.dev>"

    # Base URL of the deployed frontend, used to build the link inside reset emails
    # (as `<frontend_url>/#/reset-password?token=...`), no trailing slash.
    frontend_url: str = "http://localhost:8080"

    @field_validator("database_url", "test_database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        return _ensure_asyncpg_driver(value)

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
