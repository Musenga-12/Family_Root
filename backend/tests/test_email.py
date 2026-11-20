"""Email delivery and password recovery. No real email is ever sent: a fake sender records messages, and Resend's API
is replaced by a stand-in (httpx.MockTransport)."""
import json
import logging
import re
import time

import httpx
import pytest

from app import mail, mail_templates
from app.config import Settings, check_settings, settings
from helpers import API

pytestmark = pytest.mark.usefixtures("client")


class FakeSender:
    name, configured = "fake", True

    def __init__(self, fail: bool = False):
        self.sent: list[mail.Email] = []
        self.fail = fail

    def send(self, email: mail.Email) -> str:
        if self.fail:
            raise mail.EmailError("the email provider refused the message (HTTP 500)")
        self.sent.append(email)
        return "fake-id"


@pytest.fixture
def outbox():
    fake = FakeSender()
    mail.set_sender(fake)
    return fake.sent


def token_in(email: mail.Email) -> str:
    return re.search(r"token=([\w-]+)", email.text).group(1)


def forgot(client, email):
    return client.post(f"{API}/auth/forgot-password", json={"email": email})


def login_ok(client, email, password):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password}).status_code == 200


# ---------- asking for a link ----------

def test_existing_account_gets_a_reset_email(client, outbox):
    r = forgot(client, "James@Example.com")
    assert r.status_code == 202
    [email] = outbox
    assert email.to == "james@example.com" and email.tags == {"kind": "password-reset"}
    assert "#/reset-password?token=" in email.text and "#/reset-password?token=" in email.html
    assert "60 minutes" in email.text


def test_unknown_account_gets_the_same_answer_and_no_email(client, outbox):
    known, unknown = forgot(client, "james@example.com"), forgot(client, "nobody-here@example.com")
    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json())
    assert [e.to for e in outbox] == ["james@example.com"]


def test_answers_take_the_same_minimum_time(client, outbox, monkeypatch):
    monkeypatch.setattr(settings, "email_min_response_ms", 300)
    started = time.monotonic()
    forgot(client, "nobody-here@example.com")
    assert time.monotonic() - started >= 0.3


def test_provider_failure_is_reported_not_hidden(client):
    mail.set_sender(FakeSender(fail=True))
    r = forgot(client, "james@example.com")
    assert r.status_code == 503 and "can't send emails right now" in r.json()["detail"]
    # During the outage an unknown address gets the same answer, so the failure reveals nothing about accounts.
    other = forgot(client, "nobody-here@example.com")
    assert (other.status_code, other.json()) == (r.status_code, r.json())


def test_no_email_set_up_is_said_plainly_to_everyone(client, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")  # production without a provider: no console fallback
    a, b = forgot(client, "james@example.com"), forgot(client, "nobody-here@example.com")
    assert a.status_code == b.status_code == 503
    assert a.json() == b.json() and "Admin" in a.json()["detail"]


def test_reset_links_are_never_logged_in_production(client, caplog, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    mail.set_sender(FakeSender(fail=True))
    with caplog.at_level(logging.INFO):
        forgot(client, "james@example.com")
    assert "token=" not in caplog.text and "james@example.com" not in caplog.text


def test_asking_too_often_is_limited(client, outbox):
    codes = [forgot(client, "james@example.com").status_code for _ in range(6)]
    assert codes[:5] == [202] * 5 and codes[5] == 429


# ---------- using the link ----------

def test_successful_reset(client, outbox):
    forgot(client, "james@example.com")
    token = token_in(outbox[0])
    assert client.get(f"{API}/auth/reset-password/status", params={"token": token}).json() == {"status": "valid"}
    r = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "a-brand-new-password"})
    assert r.status_code == 200 and r.json()["access_token"]
    assert login_ok(client, "james@example.com", "a-brand-new-password")
    assert not login_ok(client, "james@example.com", "familyroots123")
    assert outbox[-1].tags == {"kind": "password-changed"} and outbox[-1].to == "james@example.com"


def test_reused_link(client, outbox):
    forgot(client, "james@example.com")
    token = token_in(outbox[0])
    client.post(f"{API}/auth/reset-password", json={"token": token, "password": "a-brand-new-password"})
    again = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "another-new-password"})
    assert again.status_code == 400 and "already used" in again.json()["detail"]
    assert client.get(f"{API}/auth/reset-password/status", params={"token": token}).json() == {"status": "used"}


def test_using_one_link_cancels_the_others(client, outbox):
    forgot(client, "james@example.com")
    forgot(client, "james@example.com")
    first, second = token_in(outbox[0]), token_in(outbox[1])
    assert client.post(f"{API}/auth/reset-password", json={"token": second, "password": "a-brand-new-password"}).status_code == 200
    assert client.post(f"{API}/auth/reset-password", json={"token": first, "password": "another-new-password"}).status_code == 400


def test_changing_password_cancels_open_links(client, outbox, auth):
    forgot(client, "james@example.com")
    token = token_in(outbox[0])
    client.post(f"{API}/auth/change-password", headers=auth("james"),
                json={"current_password": "familyroots123", "new_password": "a-brand-new-password"})
    assert client.get(f"{API}/auth/reset-password/status", params={"token": token}).json() == {"status": "used"}


def test_expired_link(client):
    from sqlmodel import Session

    from app.auth import create_reset_link
    from app.db import engine
    from app.models import User

    with Session(engine) as db:
        link, _ = create_reset_link(db, db.get(User, 1), minutes=-1)
    token = link.split("token=")[1]
    assert client.get(f"{API}/auth/reset-password/status", params={"token": token}).json() == {"status": "expired"}
    r = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "a-brand-new-password"})
    assert r.status_code == 400 and "expired" in r.json()["detail"]


def test_invalid_link(client):
    assert client.get(f"{API}/auth/reset-password/status", params={"token": "made-up"}).json() == {"status": "invalid"}
    r = client.post(f"{API}/auth/reset-password", json={"token": "made-up", "password": "a-brand-new-password"})
    assert r.status_code == 400 and "isn't valid" in r.json()["detail"]


def test_new_password_must_be_long_enough(client, outbox):
    forgot(client, "james@example.com")
    token = token_in(outbox[0])
    assert client.post(f"{API}/auth/reset-password", json={"token": token, "password": "short"}).status_code == 422
    # The link wasn't used up by the refused attempt.
    assert client.get(f"{API}/auth/reset-password/status", params={"token": token}).json() == {"status": "valid"}


def test_wrong_current_password_is_refused(client, auth, outbox):
    r = client.post(f"{API}/auth/change-password", headers=auth("james"),
                    json={"current_password": "not-my-password", "new_password": "a-brand-new-password"})
    assert r.status_code == 400
    assert outbox == []  # no "password changed" email


# ---------- other emails ----------

def test_new_family_founder_gets_a_welcome(client, outbox):
    r = client.post(f"{API}/auth/register", json={"name": "Ada Ross", "email": "ada.ross@example.org", "password": "a long passphrase 1"})
    assert r.status_code == 201
    [email] = outbox
    assert email.tags == {"kind": "welcome"} and "Ross family" in email.subject


def test_invitations_are_emailed_and_say_so(client, auth, outbox):
    inv = client.post(f"{API}/invites", headers=auth("mary"), json={"name": "Isla", "email": "isla.new@example.org"}).json()
    assert inv["emailed"] is True and inv["link"]
    assert outbox[0].to == "isla.new@example.org" and inv["link"] in outbox[0].text


def test_invitation_says_when_email_failed(client, auth):
    mail.set_sender(FakeSender(fail=True))
    inv = client.post(f"{API}/invites", headers=auth("mary"), json={"name": "Isla", "email": "isla.new@example.org"}).json()
    assert inv["emailed"] is False and inv["link"]  # the link can still be shared another way


# ---------- the Resend provider ----------

def resend(handler):
    return mail.ResendSender("re_test_key", "FamilyRoots <no-reply@mail.example.org>", "help@example.org", 5, transport=httpx.MockTransport(handler))


def test_resend_request():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "email_123"})

    email = mail_templates.password_reset("James Mackenzie", "james@example.com", "https://app.example.org/#/reset-password?token=t", 60)
    assert resend(handler).send(email) == "email_123"
    assert seen["url"] == "https://api.resend.com/emails" and seen["auth"] == "Bearer re_test_key"
    body = seen["body"]
    assert body["to"] == ["james@example.com"] and body["from"].endswith("<no-reply@mail.example.org>")
    assert body["reply_to"] == "help@example.org" and body["html"] and body["text"]
    assert body["tags"] == [{"name": "kind", "value": "password-reset"}]


def test_resend_refusal_and_timeout_raise_email_errors():
    refused = resend(lambda r: httpx.Response(403, json={"name": "validation_error", "message": "The domain is not verified"}))
    with pytest.raises(mail.EmailError, match="not verified"):
        refused.send(mail_templates.welcome("A", "a@example.org", "Ross family"))

    def slow(request):
        raise httpx.ReadTimeout("timed out", request=request)

    with pytest.raises(mail.EmailError, match="in time"):
        resend(slow).send(mail_templates.welcome("A", "a@example.org", "Ross family"))


def test_resend_is_chosen_when_its_key_is_set(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(settings, "email_from", "FamilyRoots <no-reply@mail.example.org>")
    assert mail.sender().name == "resend"
    monkeypatch.setattr(settings, "email_from", "")
    assert mail.sender().configured is False  # a key without a sender address is not a working setup


# ---------- templates and settings ----------

def test_templates_escape_names_and_have_plain_text():
    email = mail_templates.invitation("<b>Isla</b>", "isla@example.org", "Ross & Sons", "<script>x</script>", "https://a.example/#/register?invite=t")
    assert "<script>" not in email.html and "&lt;script&gt;" in email.html
    assert "Ross &amp; Sons" in email.html
    assert 'lang="en"' in email.html and 'role="presentation"' in email.html
    assert "https://a.example/#/register?invite=t" in email.text
    for e in (mail_templates.password_reset("A B", "a@x.org", "https://x/#/reset-password?token=t", 60),
              mail_templates.password_changed("A B", "a@x.org"), mail_templates.welcome("A B", "a@x.org", "B family"),
              mail_templates.verify_email("A B", "a@x.org", "https://x/#/verify?token=t", 24)):
        assert e.subject and e.text and e.html.startswith("<!doctype html>")


def test_production_refuses_unsafe_email_settings():
    base = dict(environment="production", secret_key="k" * 48, frontend_origin="https://app.example.org",
                api_base_url="https://api.example.org")
    with pytest.raises(RuntimeError, match="console"):
        check_settings(Settings(_env_file=None, **base, email_provider="console"))
    with pytest.raises(RuntimeError, match="RESEND_API_KEY"):
        check_settings(Settings(_env_file=None, **base, email_provider="resend"))
    check_settings(Settings(_env_file=None, **base, email_provider="resend", resend_api_key="re_x", email_from="FamilyRoots <a@mail.example.org>"))
