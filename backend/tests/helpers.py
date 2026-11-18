"""Small helpers shared by the tests."""
from datetime import timedelta

import jwt

API = "/api/v1"
PASSWORD = "familyroots123"  # the sample accounts' password (seed.py)

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 64
PDF = b"%PDF-1.4\n" + b"\0" * 64
WEBM = b"\x1a\x45\xdf\xa3" + b"\0" * 64


def login(client, email: str, password: str = PASSWORD):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def upload(client, headers, data: bytes = PNG, ctype: str = "image/png", name: str = "photo.png"):
    return client.post(f"{API}/uploads", headers=headers, files={"file": (name, data, ctype)})


def local(url: str) -> str:
    """A signed file link from the API, as a path the test client can open."""
    return url.split("testserver", 1)[1]


def new_family(client, email: str = "fiona@example.org", name: str = "Fiona Campbell") -> dict:
    """Start a second family; returns its Admin's auth headers."""
    r = client.post(f"{API}/auth/register", json={"name": name, "email": email, "password": "another-family-pw", "family_name": "Campbell family"})
    assert r.status_code == 201, r.text
    return bearer(r.json()["access_token"])


def make_token(payload: dict, expires_in: timedelta = timedelta(hours=1)) -> str:
    from app.auth import ALGORITHM
    from app.config import settings
    from app.models import now

    return jwt.encode({"exp": now() + expires_in, **payload}, settings.secret_key, algorithm=ALGORITHM)


def member_id(client, headers, person_id: str) -> int:
    return next(m["user_id"] for m in client.get(f"{API}/members", headers=headers).json() if m["person_id"] == person_id)
