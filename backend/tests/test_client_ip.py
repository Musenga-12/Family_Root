"""Whose attempts are counted together: the visitor's address behind the host's proxy (TRUSTED_PROXY_HOPS)."""
import pytest
from starlette.requests import Request

from app.config import settings
from app.ratelimit import client_ip
from helpers import API


def request(*forwarded: str, peer: str = "10.0.0.9") -> Request:
    """A request that arrived from `peer` with these X-Forwarded-For headers (each may hold a list)."""
    headers = [(b"x-forwarded-for", f.encode()) for f in forwarded]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers, "client": (peer, 443)})


@pytest.fixture
def hops(monkeypatch):
    def set_hops(n: int) -> None:
        monkeypatch.setattr(settings, "trusted_proxy_hops", n)
    return set_hops


def test_without_a_proxy_the_header_is_ignored(hops):
    hops(0)
    assert client_ip(request("203.0.113.7")) == "10.0.0.9"


def test_one_proxy_trusts_only_the_address_it_added(hops):
    hops(1)
    assert client_ip(request("203.0.113.7")) == "203.0.113.7"
    # The visitor wrote the first entry themselves; only the last one was added by our proxy.
    assert client_ip(request("1.2.3.4, 203.0.113.7")) == "203.0.113.7"
    # Several headers are one list, in order.
    assert client_ip(request("1.2.3.4", "5.6.7.8, 203.0.113.7")) == "203.0.113.7"


def test_two_proxies_count_from_the_right(hops):
    hops(2)
    # visitor-written, the visitor (added by the first proxy), the first proxy (added by the second)
    assert client_ip(request("1.2.3.4, 203.0.113.7, 198.51.100.2")) == "203.0.113.7"


@pytest.mark.parametrize("forwarded", [(), ("",), ("not-an-address",), ("203.0.113.7, 999.1.1.1",)])
def test_a_missing_or_bad_header_falls_back_to_the_connection(hops, forwarded):
    hops(1)
    assert client_ip(request(*forwarded)) == "10.0.0.9"


def test_too_few_entries_for_the_hops_falls_back_to_the_connection(hops):
    hops(2)
    assert client_ip(request("203.0.113.7")) == "10.0.0.9"


def test_ipv6_addresses_are_kept(hops):
    hops(1)
    assert client_ip(request("2001:db8::1")) == "2001:db8::1"


# ---------- end to end, through the sign-in limit ----------
# Sign-in allows 20 tries per visitor address in 5 minutes (and, separately, 10 per account). Each try below uses a
# different email, so only the per-address limit can apply: these tests show whose address is counted.
PER_ADDRESS = 20


def guesses(client, forwarded: list[str], start: int = 0) -> list[int]:
    return [client.post(f"{API}/auth/login", json={"email": f"nobody{start + i}@example.org", "password": "guess"},
                        headers={"X-Forwarded-For": f}).status_code for i, f in enumerate(forwarded)]


def test_made_up_addresses_do_not_escape_the_limit(client, hops):
    """The attack the hop count exists for: a new invented first entry on every try, from the same real address."""
    hops(1)
    codes = guesses(client, [f"10.9.{i}.1, 203.0.113.7" for i in range(PER_ADDRESS + 1)])
    assert codes[:PER_ADDRESS] == [401] * PER_ADDRESS and codes[PER_ADDRESS] == 429


def test_different_visitors_behind_the_proxy_have_their_own_limit(client, hops):
    hops(1)
    assert guesses(client, ["203.0.113.7"] * (PER_ADDRESS + 1))[PER_ADDRESS] == 429
    # Another visitor arriving through the same proxy is not locked out by the first one's guesses.
    assert guesses(client, ["198.51.100.20"], start=100) == [401]


def test_without_hops_every_visitor_behind_a_proxy_shares_one_limit(client, hops):
    """Why TRUSTED_PROXY_HOPS must be set on Render: with 0, the proxy's address is everyone's address."""
    hops(0)
    assert guesses(client, ["203.0.113.7"] * (PER_ADDRESS + 1))[PER_ADDRESS] == 429
    assert guesses(client, ["198.51.100.20"], start=100) == [429]


# ---------- scripts/check_client_ip.py, the after-deploy check ----------

def load_check_script():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "scripts" / "check_client_ip.py"
    spec = importlib.util.spec_from_file_location("check_client_ip", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def behind_proxies(app, visitor: str, proxies: int = 1):
    """The app as a host serves it: each proxy appends the address it received the request from to X-Forwarded-For."""
    async def wrapped(scope, receive, send):
        if scope["type"] == "http":
            headers = [(k, v) for k, v in scope["headers"] if k != b"x-forwarded-for"]
            sent = [v.decode() for k, v in scope["headers"] if k == b"x-forwarded-for"]
            chain = [visitor] + [f"10.0.0.{n + 1}" for n in range(proxies - 1)]  # each proxy adds who it heard from
            scope = {**scope, "headers": headers + [(b"x-forwarded-for", ", ".join(sent + chain).encode())],
                     "client": (f"10.0.0.{proxies}", 443)}
        await app(scope, receive, send)
    return wrapped


@pytest.mark.parametrize("proxies", [1, 2])
def test_the_check_passes_with_the_right_hops(client, hops, proxies):
    from fastapi.testclient import TestClient

    from app.main import app

    check = load_check_script()
    assert check.SIGN_IN_TRIES == PER_ADDRESS
    hops(proxies)
    with TestClient(behind_proxies(app, "203.0.113.7", proxies)) as here:
        assert check.check_made_up_addresses(here)[0]
    with TestClient(behind_proxies(app, "198.51.100.20", proxies)) as elsewhere:
        assert check.check_other_visitor(elsewhere)[0]


def test_the_check_catches_too_many_hops(client, hops):
    from fastapi.testclient import TestClient

    from app.main import app

    check = load_check_script()
    hops(2)  # but only one proxy: the visitor's own made-up entry would be believed
    with TestClient(behind_proxies(app, "203.0.113.7", 1)) as here:
        passed, message = check.check_made_up_addresses(here)
    assert not passed and "Lower TRUSTED_PROXY_HOPS" in message


def test_the_check_catches_too_few_hops(client, hops):
    from fastapi.testclient import TestClient

    from app.main import app

    check = load_check_script()
    hops(0)  # behind a proxy: everyone looks like the proxy
    with TestClient(behind_proxies(app, "203.0.113.7", 1)) as here:
        assert check.check_made_up_addresses(here)[0]
    with TestClient(behind_proxies(app, "198.51.100.20", 1)) as elsewhere:
        passed, message = check.check_other_visitor(elsewhere)
    assert not passed and "Raise TRUSTED_PROXY_HOPS" in message
