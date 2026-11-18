"""Settings read from backend/.env (see .env.example)."""
import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

API_PREFIX = "/api/v1"
DEV_SECRET = "dev-only-secret-change-me"
PLACEHOLDER_SECRETS = {DEV_SECRET, "change-me-to-a-long-random-string"}  # the defaults shipped in this repo

log = logging.getLogger("familyroots")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "production" turns on the start-up checks below and hides /docs; anything else is development.
    environment: str = "development"
    secret_key: str = DEV_SECRET
    database_url: str = "sqlite:///./familyroots.db"
    frontend_origin: str = "http://localhost:5173"
    # More addresses the app may be opened from, comma-separated (e.g. "http://localhost:4173" for npm run preview).
    extra_origins: str = ""
    access_token_minutes: int = 60 * 24
    # Public address of this API, used to build file links the browser can open (e.g. <img src>).
    api_base_url: str = "http://localhost:8000"
    upload_dir: str = "uploads"
    max_image_mb: int = 10
    max_audio_mb: int = 50
    file_link_minutes: int = 60 * 12
    # Limits on sign-in, sign-up and password-reset attempts (see app/ratelimit.py).
    rate_limit_enabled: bool = True

    @property
    def production(self) -> bool:
        return self.environment.strip().lower() == "production"


def check_settings(s: "Settings") -> None:
    """Refuse to start a production server with settings that are only safe on a developer's computer."""
    problems = []
    if s.secret_key in PLACEHOLDER_SECRETS or len(s.secret_key) < 32:
        problems.append("SECRET_KEY must be a long random value (32+ characters), e.g. python -c \"import secrets; print(secrets.token_urlsafe(48))\"")
    for name, value in (("FRONTEND_ORIGIN", s.frontend_origin), ("API_BASE_URL", s.api_base_url)):
        if "localhost" in value or "127.0.0.1" in value:
            problems.append(f"{name} still points at this computer ({value})")
    if not problems:
        return
    if s.production:
        raise RuntimeError("Unsafe production settings in backend/.env:\n- " + "\n- ".join(problems))
    if s.secret_key in PLACEHOLDER_SECRETS:
        log.warning("SECRET_KEY is the sample value: fine on your own computer, never on a server others can reach.")


settings = Settings()
