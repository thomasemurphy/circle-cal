from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://localhost/circle_cal"
    google_client_id: str = ""
    google_client_secret: str = ""
    jwt_secret: str = "dev-secret-change-in-production"
    frontend_url: str = "http://localhost:8000"

    @field_validator("database_url", mode="before")
    @classmethod
    def convert_postgres_url(cls, v: str) -> str:
        # Heroku uses postgres:// but SQLAlchemy async needs postgresql+asyncpg://
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
