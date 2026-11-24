"""Sending email: password resets, invitations, welcome and "your password was changed" notes (see mail_templates.py).
Only *how* mail leaves the server lives here; what is sent and when is decided by the routers (auth.py, admin.py).

EMAIL_PROVIDER chooses the way out:
  resend       Resend's HTTP API: RESEND_API_KEY and EMAIL_FROM on a domain verified in Resend. The production choice.
  resend-test  Resend's test mode, for when no domain has been bought yet: sends from onboarding@resend.dev, and every
               message goes to EMAIL_TEST_RECIPIENT (Resend's delivered@ / bounced@ / complained@resend.dev, or the
               address the Resend account was opened with), never to the person it was written for. Development only.
  smtp         any SMTP server: Mailpit on your own computer (SMTP_HOST=localhost, SMTP_PORT=1025), or later a mail
               service with SMTP_USERNAME / SMTP_PASSWORD.
  console      write messages to the server log. Development only: a log must never hold reset links.
  none         no email.
  (empty)      resend if RESEND_API_KEY and EMAIL_FROM are set, else smtp if SMTP_HOST is set, else console in
               development and none in production.

delivery_state() is one of:
  development                 not production: messages go to a test destination (console, Mailpit, Resend test)
  production-configured       production, and messages really reach the people they are for
  production-not-configured   production without a real way to deliver. Nothing claims an email was sent;
                              "Forgot password" says so and points to an Admin-made reset link instead.

Moving to a verified domain later is a settings change only (EMAIL_PROVIDER=resend, EMAIL_FROM=…@your-domain).
Keys and passwords are read on the server only; nothing about email is ever given to the web app.
"""
import base64
import logging
import smtplib
import ssl
import time
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import parseaddr

import httpx

from app.config import settings

log = logging.getLogger("familyroots")
RESEND_URL = "https://api.resend.com/emails"
GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
# Resend's shared test sender and its documented test inboxes (resend.com/docs/dashboard/emails/send-test-emails).
RESEND_TEST_FROM = "FamilyRoots <onboarding@resend.dev>"
RESEND_TEST_RECIPIENTS = ("delivered@resend.dev", "bounced@resend.dev", "complained@resend.dev")


class EmailError(Exception):
    """The message could not be handed to the email provider. The text is safe to log (no addresses, no links)."""


@dataclass
class Email:
    to: str
    subject: str
    html: str
    text: str
    tags: dict[str, str] = field(default_factory=dict)  # e.g. {"kind": "password-reset"}, for the provider's dashboard


def domain_of(address: str) -> str:
    return parseaddr(address)[1].rpartition("@")[2].lower()


class ResendSender:
    """Resend's HTTP API. With `test_recipient`, every message goes there instead (Resend's test mode)."""
    name = "resend"
    configured = True

    def __init__(self, api_key: str, sender: str, reply_to: str = "", timeout: float = 10,
                 transport: httpx.BaseTransport | None = None, test_recipient: str = ""):
        self.sender, self.reply_to, self.test_recipient = sender, reply_to, test_recipient
        # Real delivery only from your own verified domain: resend.dev can only reach Resend's test inboxes and the
        # account owner.
        self.real = not test_recipient and domain_of(sender) != "resend.dev"
        if test_recipient:
            self.name = "resend-test"
        self.client = httpx.Client(headers={"Authorization": f"Bearer {api_key}"}, timeout=timeout, transport=transport)

    def send(self, email: Email) -> str:
        body = {"from": self.sender, "to": [self.test_recipient or email.to],
                "subject": f"[Test] {email.subject}" if self.test_recipient else email.subject,
                "html": email.html, "text": email.text,
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


class GmailApiSender:
    """Send mail through Gmail's API using a refresh token."""
    name = "gmail-api"
    configured = True
    real = True

    def __init__(self, client_id: str, client_secret: str, refresh_token: str, sender: str,
                 reply_to: str = "", timeout: float = 10, transport: httpx.BaseTransport | None = None):
        self.client_id, self.client_secret, self.refresh_token = client_id, client_secret, refresh_token
        self.sender, self.reply_to, self.timeout = sender, reply_to, timeout
        self.client = httpx.Client(timeout=timeout, transport=transport)

    def send(self, email: Email) -> str:
        try:
            token_response = self.client.post(
                GMAIL_TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": self.refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            if token_response.status_code >= 300:
                raise EmailError(f"Gmail authentication failed (HTTP {token_response.status_code})")
            access_token = (token_response.json() or {}).get("access_token")
            if not access_token:
                raise EmailError("Gmail authentication response did not contain an access token")

            message = EmailMessage()
            message["From"], message["To"], message["Subject"] = self.sender, email.to, email.subject
            if self.reply_to:
                message["Reply-To"] = self.reply_to
            message.set_content(email.text)
            message.add_alternative(email.html, subtype="html")
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
            response = self.client.post(
                GMAIL_SEND_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                json={"raw": raw},
            )
            if response.status_code >= 300:
                raise EmailError(f"Gmail refused the message (HTTP {response.status_code})")
            return (response.json() or {}).get("id", "")
        except EmailError:
            raise
        except httpx.TimeoutException as e:
            raise EmailError("the email provider did not answer in time") from e
        except httpx.HTTPError as e:
            raise EmailError(f"the email provider could not be reached ({e.__class__.__name__})") from e
        except (ValueError, KeyError) as e:
            raise EmailError("Gmail returned an invalid response") from e


class SmtpSender:
    """Any SMTP server: Mailpit on a developer's computer, or a mail service later."""
    name = "smtp"
    configured = True
    real = True

    def __init__(self, host: str, port: int, sender: str, username: str = "", password: str = "", starttls: bool = False,
                 use_ssl: bool = False, reply_to: str = "", timeout: float = 10, smtp_class=None):
        self.host, self.port, self.sender, self.reply_to = host, port, sender, reply_to
        self.username, self.password, self.starttls, self.use_ssl, self.timeout = username, password, starttls, use_ssl, timeout
        self.smtp_class = smtp_class or (smtplib.SMTP_SSL if use_ssl else smtplib.SMTP)

    def send(self, email: Email) -> str:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = self.sender, email.to, email.subject
        if self.reply_to:
            msg["Reply-To"] = self.reply_to
        msg.set_content(email.text)
        msg.add_alternative(email.html, subtype="html")
        try:
            with self.smtp_class(self.host, self.port, timeout=self.timeout) as smtp:
                if self.starttls:
                    smtp.starttls(context=ssl.create_default_context())
                if self.username:
                    smtp.login(self.username, self.password)
                smtp.send_message(msg)
        except (OSError, smtplib.SMTPException) as e:
            raise EmailError(f"the mail server refused or could not be reached ({e.__class__.__name__})") from e
        return msg.get("Message-ID", "") or "smtp"



class ConsoleSender:
    """Development only: the message goes to the server log, where a developer can open the link."""
    name = "console"
    configured = True
    real = False

    def send(self, email: Email) -> str:
        log.warning("Email to %s: %s\n%s", email.to, email.subject, email.text)
        return "console"


class NoSender:
    name = "none"
    configured = False
    real = False

    def __init__(self, reason: str = "email sending is not set up on this server"):
        self.reason = reason

    def send(self, email: Email) -> str:
        raise EmailError(self.reason)


_override = None  # tests put a fake sender here (set_sender)
_cache: dict[tuple, object] = {}


def provider() -> str:
    """The provider asked for, or the one chosen from what is set (see the module notes)."""
    p = settings.email_provider.strip().lower()
    if p:
        return p
    if settings.resend_api_key and settings.email_from:
        return "resend"
    if settings.smtp_host:
        return "smtp"
    return "none" if settings.production else "console"


def _cached(key: tuple, make):
    if key not in _cache:
        _cache.clear()
        _cache[key] = make()
    return _cache[key]


def _build():
    p = provider()
    s = settings
    if p == "resend" and s.resend_api_key and s.email_from:
        if s.production and domain_of(s.email_from) == "resend.dev":
            return NoSender("EMAIL_FROM is Resend's shared test address, which can't reach real people: verify a domain first")
        return _cached(("resend", s.resend_api_key, s.email_from, s.email_reply_to, s.email_timeout_seconds),
                       lambda: ResendSender(s.resend_api_key, s.email_from, s.email_reply_to, s.email_timeout_seconds))
    if p == "resend-test" and s.resend_api_key:
        if s.production:
            return NoSender("Resend's test mode can't deliver to real people")
        return _cached(("resend-test", s.resend_api_key, s.email_test_recipient, s.email_timeout_seconds),
                       lambda: ResendSender(s.resend_api_key, RESEND_TEST_FROM, "", s.email_timeout_seconds,
                                            test_recipient=s.email_test_recipient))
    if p == "smtp" and s.smtp_host and (s.email_from or not s.production):
        return SmtpSender(s.smtp_host, s.smtp_port, s.email_from or "FamilyRoots <familyroots@localhost>", s.smtp_username,
                          s.smtp_password, s.smtp_starttls, s.smtp_ssl, s.email_reply_to, s.email_timeout_seconds)
    if p == "gmail-api":
        if not all((s.gmail_client_id, s.gmail_client_secret, s.gmail_refresh_token, s.email_from)):
            return NoSender("Gmail API credentials or EMAIL_FROM are missing")

        return _cached(
            ("gmail-api", s.gmail_client_id, s.gmail_client_secret,
             s.gmail_refresh_token, s.email_from, s.email_reply_to,
             s.email_timeout_seconds),
            lambda: GmailApiSender(
                s.gmail_client_id,
                s.gmail_client_secret,
                s.gmail_refresh_token,
                s.email_from,
                s.email_reply_to,
                s.email_timeout_seconds,
            ),
        )
    if p == "console" and not s.production:
        return ConsoleSender()
    return NoSender()


def sender():
    """The sender for the current settings (read each time, so switching ENVIRONMENT can never leave the console on)."""
    return _override or _build()


def delivery_state() -> str:
    if not settings.production:
        return "development"
    s = sender()
    return "production-configured" if s.configured and getattr(s, "real", False) else "production-not-configured"


def can_email() -> bool:
    """Whether a message sent now is expected to arrive somewhere useful: in production, the person's own inbox;
    in development, a test destination (console, Mailpit, Resend test inbox)."""
    s = sender()
    if not s.configured:
        return False
    return getattr(s, "real", False) or not settings.production


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
    if not can_email():
        return False
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
