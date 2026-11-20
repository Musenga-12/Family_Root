"""Sending email: password resets, invitations, welcome and "your password was changed" notes (see mail_templates.py).

EMAIL_PROVIDER chooses how mail leaves this server:
  resend   Resend's HTTP API (RESEND_API_KEY, EMAIL_FROM on a domain verified in Resend). The production choice.
  console  write the message to the server log. Developers' computers only: refused in production, because a log
           would then hold reset links.
  none     no email. Features that need it say so honestly instead of pretending a message was sent.
  (empty)  resend when RESEND_API_KEY is set, otherwise console in development and none in production.

Another provider (SMTP, SES, Postmark…) is one more class with a `send(Email) -> str` method, added to `_build`.
The API key is read on the server only; nothing about email is ever given to the web app.
"""
import logging
import time
from dataclasses import dataclass, field

import httpx

from app.config import settings

log = logging.getLogger("familyroots")
RESEND_URL = "https://api.resend.com/emails"


class EmailError(Exception):
    """The message could not be handed to the email provider. The text is safe to log (no addresses, no links)."""


@dataclass
class Email:
    to: str
    subject: str
    html: str
    text: str
    tags: dict[str, str] = field(default_factory=dict)  # e.g. {"kind": "password-reset"}, for the provider's dashboard


class ResendSender:
    name = "resend"
    configured = True

    def __init__(self, api_key: str, sender: str, reply_to: str = "", timeout: float = 10, transport: httpx.BaseTransport | None = None):
        self.sender, self.reply_to = sender, reply_to
        self.client = httpx.Client(headers={"Authorization": f"Bearer {api_key}"}, timeout=timeout, transport=transport)

    def send(self, email: Email) -> str:
        body = {"from": self.sender, "to": [email.to], "subject": email.subject, "html": email.html, "text": email.text,
                "tags": [{"name": k, "value": v} for k, v in email.tags.items()]}
        if self.reply_to:
            body["reply_to"] = self.reply_to
        try:
            r = self.client.post(RESEND_URL, json=body)
        except httpx.TimeoutException as e:
            raise EmailError("the email provider did not answer in time") from e
        except httpx.HTTPError as e:
            raise EmailError(f"the email provider could not be reached ({e.__class__.__name__})") from e
        if r.status_code >= 300:
            # Resend explains the problem in `name` / `message` (e.g. "validation_error", "The domain is not verified").
            try:
                why = r.json().get("message") or r.json().get("name") or ""
            except ValueError:
                why = ""
            raise EmailError(f"the email provider refused the message (HTTP {r.status_code}) {why}".strip())
        return (r.json() or {}).get("id", "")


class ConsoleSender:
    """Development only: the message goes to the server log, where a developer can open the link."""
    name = "console"
    configured = True

    def send(self, email: Email) -> str:
        log.warning("Email to %s: %s\n%s", email.to, email.subject, email.text)
        return "console"


class NoSender:
    name = "none"
    configured = False

    def send(self, email: Email) -> str:
        raise EmailError("email sending is not set up on this server")


_override = None  # tests put a fake sender here (set_sender)
_cache: dict[tuple, object] = {}


def _build():
    provider = settings.email_provider.strip().lower() or ("resend" if settings.resend_api_key else "none" if settings.production else "console")
    if provider == "resend" and settings.resend_api_key and settings.email_from:
        key = ("resend", settings.resend_api_key, settings.email_from, settings.email_reply_to, settings.email_timeout_seconds)
        if key not in _cache:
            _cache.clear()
            _cache[key] = ResendSender(settings.resend_api_key, settings.email_from, settings.email_reply_to, settings.email_timeout_seconds)
        return _cache[key]
    if provider == "console" and not settings.production:
        return ConsoleSender()
    return NoSender()


def sender():
    """The sender for the current settings (read each time, so switching ENVIRONMENT can never leave the console on)."""
    return _override or _build()


def set_sender(s) -> None:
    """Tests: replace the sender (None restores the configured one). Real email is never sent from tests."""
    global _override
    _override = s


def send(email: Email) -> str:
    """Hand one message to the provider. Raises EmailError if it can't."""
    return sender().send(email)


def send_quietly(email: Email) -> bool:
    """For messages nobody is waiting for (welcome, "password changed", invitations): a failure is logged, without the
    address or any link, and doesn't fail the request. Used from background tasks."""
    try:
        send(email)
        return True
    except EmailError as e:
        log.warning("Could not send %s email: %s", email.tags.get("kind", "an"), e)
        return False


class Outage:
    """After a failed send, every reset request gets the same "can't send right now" answer for a few minutes, whether
    or not the address has an account, so a provider outage doesn't reveal who is registered."""

    def __init__(self, minutes: float = 5):
        self.seconds = minutes * 60
        self.since: float | None = None

    def active(self) -> bool:
        return self.since is not None and time.monotonic() - self.since < self.seconds

    def start(self) -> None:
        self.since = time.monotonic()

    def clear(self) -> None:
        self.since = None


outage = Outage()
