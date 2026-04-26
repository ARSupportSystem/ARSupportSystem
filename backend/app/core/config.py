from typing import List, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env")

    APP_NAME: str = "AR Support System"
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ENV: str = "development"
    RATE_LIMIT_LOGIN: str = "5/minute"
    MAX_FAILED_LOGINS: int = 5
    FAILED_LOGIN_WINDOW_MINUTES: int = 10
    BOOTSTRAP_COMPLETE: bool = False
    HTTPS_CERT_FILE: Optional[str] = None
    HTTPS_KEY_FILE: Optional[str] = None

    DATABASE_URL: str = "sqlite:///./ar_support.db"

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @model_validator(mode="after")
    def validate_secret_key(self) -> "Settings":
        """Fail fast when an insecure default secret is used outside development."""
        if self.SECRET_KEY == "change-this-in-production" and self.ENV != "development":
            raise RuntimeError(
                "Insecure SECRET_KEY detected. Configure a strong SECRET_KEY when ENV is not development."
            )
        return self

    def get_cors_origins(self) -> List[str]:
        """Return cleaned CORS origins from a comma-separated configuration value."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

settings = Settings()
