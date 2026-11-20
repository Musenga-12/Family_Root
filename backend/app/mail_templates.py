"""FamilyRoots emails: each one as accessible HTML and plain text, in the app's plain, warm language.

The HTML uses a single centred table and inline styles (what email programs reliably support), real text rather than
images, a large button that is also written out as a link, colours with strong contrast, and lang/role attributes for
screen readers. Everything that comes from people (names, family names) is escaped.
"""
from html import escape

from app.config import settings
from app.mail import Email

GREEN, INK, MUTED, BG = "#245b4a", "#1d2b25", "#4c5b54", "#f4f1ea"


def app_link(path: str) -> str:
    """A page in the web app. It uses hash routing, so links need the "#"."""
    return f"{settings.frontend_origin.rstrip('/')}/#{path}"


def _layout(title: str, preheader: str, paragraphs: list[str], button: tuple[str, str] | None, footnote: str) -> str:
    """`paragraphs` and `footnote` are already-escaped HTML; `button` is (label, url)."""
    body = "".join(f'<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:{INK};">{p}</p>' for p in paragraphs)
    if button:
        label, url = escape(button[0]), escape(button[1], quote=True)
        body += (
            f'<p style="margin:24px 0;"><a href="{url}" style="display:inline-block;background:{GREEN};color:#ffffff;'
            f'font-size:17px;font-weight:bold;text-decoration:none;padding:14px 26px;border-radius:10px;">{label}</a></p>'
            f'<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:{MUTED};">If the button doesn\'t work, copy this '
            f'address into your browser:<br><a href="{url}" style="color:{GREEN};word-break:break-all;">{url}</a></p>'
        )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:{BG};">
<div style="display:none;max-height:0;overflow:hidden;">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;">
<tr><td style="padding:24px 28px 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:{GREEN};">&#127795; FamilyRoots</td></tr>
<tr><td style="padding:8px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:{INK};">{escape(title)}</h1>
{body}
</td></tr>
<tr><td style="padding:16px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:{MUTED};border-top:1px solid #e3ded3;">
{footnote}<br>FamilyRoots: a private archive for your family's tree, photos, stories and records.
</td></tr></table></td></tr></table></body></html>"""


def _text(title: str, paragraphs: list[str], link: tuple[str, str] | None, footnote: str) -> str:
    parts = ["FamilyRoots", "", title, "", *[p + "\n" for p in paragraphs]]
    if link:
        parts += [f"{link[0]}:", link[1], ""]
    parts += [footnote, "", "FamilyRoots: a private archive for your family's tree, photos, stories and records."]
    return "\n".join(parts)


def _first(name: str) -> str:
    return (name or "").split(" ")[0] or "there"


def password_reset(name: str, email: str, link: str, minutes: int) -> Email:
    title = "Choose a new password"
    lines = [f"Hello {_first(name)},",
             f"Someone asked to choose a new password for the FamilyRoots account {email}. If it was you, use the button below. "
             f"The link works once, for {minutes} minutes.",
             "Choosing a new password signs you out on your other devices."]
    note = "Didn't ask for this? You can ignore this email: your password stays the same and nobody can use this link without access to your inbox."
    return Email(to=email, subject="Choose a new FamilyRoots password", tags={"kind": "password-reset"},
                 html=_layout(title, f"Your link to choose a new password (works for {minutes} minutes).",
                              [escape(x) for x in lines], ("Choose a new password", link), escape(note)),
                 text=_text(title, lines, ("Choose a new password", link), note))


def password_changed(name: str, email: str) -> Email:
    title = "Your password was changed"
    lines = [f"Hello {_first(name)},",
             f"The password for your FamilyRoots account {email} was just changed, and your other devices were signed out."]
    note = "Wasn't you? Choose a new password straight away with \"Forgot password?\" on the sign-in page, and tell an Admin of your family archive."
    return Email(to=email, subject="Your FamilyRoots password was changed", tags={"kind": "password-changed"},
                 html=_layout(title, "Your FamilyRoots password was just changed.", [escape(x) for x in lines],
                              ("Go to FamilyRoots", app_link("/login")), escape(note)),
                 text=_text(title, lines, ("Sign in", app_link("/login")), note))


def welcome(name: str, email: str, family: str) -> Email:
    title = f"Welcome to {family}"
    lines = [f"Hello {_first(name)},",
             f"Your place in the {family} archive on FamilyRoots is ready.",
             "Good first steps: add yourself and a few relatives to the family tree, upload one favourite photo, "
             "and record a story from an elder while you can."]
    note = f"You're receiving this because an account was created for {email}."
    return Email(to=email, subject=f"Welcome to {family} on FamilyRoots", tags={"kind": "welcome"},
                 html=_layout(title, "Your family archive is ready.", [escape(x) for x in lines],
                              ("Open my family archive", app_link("/overview")), escape(note)),
                 text=_text(title, lines, ("Open your family archive", app_link("/overview")), note))


def verify_email(name: str, email: str, link: str, hours: int) -> Email:
    """Ready for a "confirm your address" step; the app doesn't ask for one yet (it needs a new database column)."""
    title = "Confirm your email address"
    lines = [f"Hello {_first(name)},", f"Please confirm that {email} is your address, so we can reach you about your family archive. "
             f"The link works for {hours} hours."]
    note = "Didn't create a FamilyRoots account? You can ignore this email."
    return Email(to=email, subject="Confirm your email for FamilyRoots", tags={"kind": "verify-email"},
                 html=_layout(title, "Confirm your email address for FamilyRoots.", [escape(x) for x in lines],
                              ("Confirm my email", link), escape(note)),
                 text=_text(title, lines, ("Confirm your email", link), note))


def invitation(name: str, email: str, family: str, inviter: str, link: str) -> Email:
    title = f"{inviter} invited you to {family}"
    lines = [f"Hello {_first(name)},",
             f"{inviter} has invited you to join the {family} archive on FamilyRoots: a private place for your family's tree, "
             "photos, recorded stories and records.",
             "Create your account with this email address to join."]
    note = "Not expecting this? You can ignore this email; nothing happens unless you create an account."
    return Email(to=email, subject=f"{inviter} invited you to {family} on FamilyRoots", tags={"kind": "invitation"},
                 html=_layout(title, f"{inviter} invited you to the family archive.", [escape(x) for x in lines],
                              ("Accept the invitation", link), escape(note)),
                 text=_text(title, lines, ("Accept the invitation", link), note))
