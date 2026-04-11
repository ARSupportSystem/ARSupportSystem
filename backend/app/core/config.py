from pydantic import BaseSettings

class Settings(BaseSettings):
    app_name: str = "FastAPI Project"
    admin_email: str = "admin@example.com"
    items_per_page: int = 10

    class Config:
        env_file = ".env"

settings = Settings()