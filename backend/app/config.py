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
    # Where uploaded files live: "local" (UPLOAD_DIR on this server's disk) or "supabase" (a private bucket; see storage.py).
    storage: str = "local"
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_bucket: str = "family-files"
    # Email (app/mail.py). EMAIL_PROVIDER: resend | console | none, or empty to choose from what is set.
    email_provider: str = ""
    resend_api_key: str = ""
    email_from: str = ""  # e.g. "FamilyRoots <no-reply@mail.yourdomain.org>", on a domain verified in Resend
    email_reply_to: str = ""
    email_timeout_seconds: float = 10
    # "Forgot password" answers take at least this long, so the time taken doesn't reveal whether an email was sent.
    email_min_response_ms: int = 1500
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
    if s.storage.strip().lower() == "supabase" and not (s.supabase_url and s.supabase_service_key):
        problems.append("STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY")
    if s.storage.strip().lower() not in ("local", "supabase"):
        problems.append(f"STORAGE must be local or supabase, not {s.storage!r}")
    if s.production and not problems and s.storage.strip().lower() == "local":
        log.warning("Uploads are stored on this server's disk (%s). Use a persistent disk, or STORAGE=supabase, so photos "
                    "survive redeploys.", s.upload_dir)
    provider = s.email_provider.strip().lower()
    if provider not in ("", "resend", "console", "none"):
        problems.append(f"EMAIL_PROVIDER must be resend, console or none, not {provider!r}")
    if provider == "resend" and not (s.resend_api_key and s.email_from):
        problems.append("EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM")
    if s.production and provider == "console":
        problems.append("EMAIL_PROVIDER=console writes reset links to the log: not allowed in production")
    if s.production and not problems and not (s.resend_api_key and s.email_from):
        log.warning("Email is not set up (RESEND_API_KEY, EMAIL_FROM): \"Forgot password\" will say it can't send, and "
                    "invitations must be shared by link.")
    if not problems:
        return
    if s.production:
        raise RuntimeError("Unsafe production settings in backend/.env:\n- " + "\n- ".join(problems))
    if s.secret_key in PLACEHOLDER_SECRETS:
        log.warning("SECRET_KEY is the sample value: fine on your own computer, never on a server others can reach.")


settings = Settings()
