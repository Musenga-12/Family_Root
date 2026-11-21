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
    # Email (app/mail.py). EMAIL_PROVIDER: resend | resend-test | smtp | console | none, or empty to choose from what is set.
    email_provider: str = ""
    resend_api_key: str = ""
    email_from: str = ""  # e.g. "FamilyRoots <no-reply@mail.yourdomain.org>", on a domain verified in Resend
    email_reply_to: str = ""
    email_timeout_seconds: float = 10
    # EMAIL_PROVIDER=resend-test: where every message goes (a Resend test inbox, or the Resend account's own address).
    email_test_recipient: str = "delivered@resend.dev"
    # EMAIL_PROVIDER=smtp: Mailpit locally is SMTP_HOST=localhost, SMTP_PORT=1025, no login, no TLS.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    smtp_ssl: bool = False
    # "Forgot password" answers take at least this long, so the time taken doesn't reveal whether an email was sent.
    email_min_response_ms: int = 1500
    max_image_mb: int = 10
    max_audio_mb: int = 50
    file_link_minutes: int = 60 * 12
    # Limits on sign-in, sign-up and password-reset attempts (see app/ratelimit.py).
    rate_limit_enabled: bool = True
    # How many proxies of our own sit in front of this server and add the visitor's address to X-Forwarded-For
    # (0: none, the connection's own address is the visitor's). Anything further left in the header was written by
    # the visitor and is never trusted. See ratelimit.client_ip and DEPLOY.md → Visitor addresses behind a proxy.
    trusted_proxy_hops: int = 0

    def origins(self) -> list[str]:
        """FRONTEND_ORIGIN and EXTRA_ORIGINS: the only web addresses whose pages may call this API."""
        return [o.strip().rstrip("/") for o in [self.frontend_origin, *self.extra_origins.split(",")] if o.strip()]

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
    if s.production:
        if s.database_url.strip().lower().startswith("sqlite"):
            # A file on the server's disk: most hosts (Render included) wipe it on every deploy, losing every family's data.
            problems.append("DATABASE_URL is a SQLite file; production needs the PostgreSQL database (see DEPLOY.md)")
        for origin in s.origins():
            scheme, _, rest = origin.partition("://")
            if scheme != "https" or not rest or "*" in origin or "/" in rest:
                problems.append(f"FRONTEND_ORIGIN / EXTRA_ORIGINS must be exact https:// addresses with no path or wildcard, not {origin!r}")
    if not 0 <= s.trusted_proxy_hops <= 5:
        problems.append(f"TRUSTED_PROXY_HOPS must be between 0 and 5, not {s.trusted_proxy_hops}")
    if s.storage.strip().lower() == "supabase" and not (s.supabase_url and s.supabase_service_key):
        problems.append("STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY")
    if s.storage.strip().lower() not in ("local", "supabase"):
        problems.append(f"STORAGE must be local or supabase, not {s.storage!r}")
    if s.production and not problems and s.storage.strip().lower() == "local":
        log.warning("Uploads are stored on this server's disk (%s). Use a persistent disk, or STORAGE=supabase, so photos "
                    "survive redeploys.", s.upload_dir)
    if s.production and not problems and s.trusted_proxy_hops == 0:
        log.warning("TRUSTED_PROXY_HOPS=0: attempt limits use the connection's address. Behind a host's proxy (Render, "
                    "Railway…) every visitor then shares one limit; set it as in DEPLOY.md → Visitor addresses behind a proxy.")
    provider = s.email_provider.strip().lower()
    if provider not in ("", "resend", "resend-test", "smtp", "console", "none"):
        problems.append(f"EMAIL_PROVIDER must be resend, resend-test, smtp, console or none, not {provider!r}")
    if provider in ("resend", "resend-test") and not s.resend_api_key:
        problems.append(f"EMAIL_PROVIDER={provider} needs RESEND_API_KEY")
    if provider == "resend" and not s.email_from:
        problems.append("EMAIL_PROVIDER=resend needs EMAIL_FROM (an address on a domain verified in Resend)")
    if provider == "smtp" and not s.smtp_host:
        problems.append("EMAIL_PROVIDER=smtp needs SMTP_HOST")
    if s.production and provider == "smtp" and not s.email_from:
        problems.append("EMAIL_PROVIDER=smtp needs EMAIL_FROM in production")
    if s.production and provider == "console":
        problems.append("EMAIL_PROVIDER=console writes reset links to the log: not allowed in production")
    if s.production and not problems:
        from app import mail  # here, not at the top: mail imports this module

        if mail.delivery_state() == "production-not-configured":
            log.warning("Email: production-not-configured (%s). \"Forgot password\" will say it can't send and point to an "
                        "Admin-made reset link; invitations are shared by link. See DEPLOY.md → Email.", mail.sender().reason
                        if hasattr(mail.sender(), "reason") else "no real delivery")
        else:
            log.info("Email: production-configured (%s).", mail.provider())
    if not problems:
        return
    if s.production:
        raise RuntimeError("Unsafe production settings in backend/.env:\n- " + "\n- ".join(problems))
    if s.secret_key in PLACEHOLDER_SECRETS:
        log.warning("SECRET_KEY is the sample value: fine on your own computer, never on a server others can reach.")


settings = Settings()
