from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GROQ_API_KEY: str = ""
    JWT_SECRET: str = "change-me-in-production-please"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MIN: int = 60
    DATABASE_URL: str = "sqlite:///./medscribe.db"
    CORS_ORIGINS: str = "http://localhost:5173"
    # Google OAuth — get a client ID at https://console.cloud.google.com (free).
    # When empty, the /auth/google endpoint returns 503 — the email/password
    # path keeps working in dev without Google credentials.
    GOOGLE_OAUTH_CLIENT_ID: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
