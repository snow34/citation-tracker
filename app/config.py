from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    return Settings()
