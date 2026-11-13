"""Settings read from backend/.env (see .env.example)."""
from pydantic_settings import BaseSettings, SettingsConfigDict

API_PREFIX = "/api/v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-only-secret-change-me"
    database_url: str = "sqlite:///./familyroots.db"
    frontend_origin: str = "http://localhost:5173"
    access_token_minutes: int = 60 * 24
    # Public address of this API, used to build file links the browser can open (e.g. <img src>).
    api_base_url: str = "http://localhost:8000"
    upload_dir: str = "uploads"
    max_image_mb: int = 10
    max_audio_mb: int = 50
    file_link_minutes: int = 60 * 12


settings = Settings()
