"""Send one sample email with the current settings, to check the email setup by hand. Never run by the tests.

The sample is a password-reset email with a made-up link (it can't change any password). Run from backend/:

    .venv\\Scripts\\python scripts/send_test_email.py                     # to EMAIL_TEST_RECIPIENT (resend-test) or Mailpit
    .venv\\Scripts\\python scripts/send_test_email.py --to you@example.org

With EMAIL_PROVIDER=resend-test it can only reach Resend's test inboxes (delivered@resend.dev …) or the address
the Resend account was opened with. With Mailpit, open http://localhost:8025 to see the message.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import mail, mail_templates  # noqa: E402
from app.config import settings  # noqa: E402


def main(argv: list[str]) -> int:
    to = argv[argv.index("--to") + 1] if "--to" in argv else settings.email_test_recipient
    sender = mail.sender()
    print(f"Email state: {mail.delivery_state()} (provider: {sender.name})")
    if not mail.can_email():
        print(f"Nothing sent: {getattr(sender, 'reason', 'no way to deliver email is set up')}. See DEPLOY.md → Email.")
        return 1
    if sender.name == "resend-test":
        print(f"Resend test mode: the message goes to {settings.email_test_recipient}, whatever --to says.")
    email = mail_templates.password_reset("Test Person", to, mail_templates.app_link("/reset-password?token=sample-not-a-real-token"), 60)
    try:
        ref = mail.send(email)
    except mail.EmailError as e:
        print(f"Not sent: {e}")
        return 1
    print(f"Handed to {sender.name}" + (f" (id {ref})" if ref and ref not in ("console", "smtp") else "") + ".")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
