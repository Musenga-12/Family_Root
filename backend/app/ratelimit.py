"""A small limit on how often sign-in, sign-up and password-reset requests can be tried, so nobody can guess
passwords, family codes or invitation links by trying thousands of them.

Counts are kept in memory, which works for one server process (the same assumption as realtime.py). With several
processes or servers, keep them in Redis (or similar) instead. Behind a proxy (Render and most hosts), set
TRUSTED_PROXY_HOPS so attempts are counted per visitor, not per proxy (see client_ip).
"""
import ipaddress
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.config import settings


class RateLimiter:
    def __init__(self) -> None:
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()

    def hit(self, key: str, limit: int, seconds: int) -> None:
        """Count one attempt for `key`; refuse it (429) if there were already `limit` in the last `seconds`."""
        if not settings.rate_limit_enabled:
            return
        t = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and q[0] <= t - seconds:
                q.popleft()
            if len(q) >= limit:
                wait = int(q[0] + seconds - t) + 1
                raise HTTPException(429, "Too many attempts. Please wait a few minutes and try again.",
                                    {"Retry-After": str(wait)})
            q.append(t)
            if len(self.hits) > 10_000:  # forget keys nobody has used for a while
                for k in [k for k, v in self.hits.items() if not v or v[-1] <= t - 3600]:
                    del self.hits[k]

    def reset(self) -> None:
        with self.lock:
            self.hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    """The visitor's address, for counting their attempts.

    With TRUSTED_PROXY_HOPS=0 it is the address the connection came from. Behind N proxies of our own, each adds the
    address it received the request from to the end of X-Forwarded-For, so the visitor is the Nth entry from the right.
    Entries further left were sent by the visitor and could be anything; trusting them (as the leftmost-entry rule of
    `--forwarded-allow-ips '*'` does) would let anyone dodge the limits by sending a new made-up address each time.
    A header that is missing, too short or not an address falls back to the connection's address.
    """
    peer = request.client.host if request.client else "unknown"
    hops = settings.trusted_proxy_hops
    if hops <= 0:
        return peer
    # Several X-Forwarded-For headers count as one list, in order (RFC 9110, section 5.3).
    entries = [e.strip() for h in request.headers.getlist("x-forwarded-for") for e in h.split(",") if e.strip()]
    if len(entries) < hops:
        return peer
    try:
        return str(ipaddress.ip_address(entries[-hops]))
    except ValueError:
        return peer


def limit(name: str, times: int, seconds: int):
    """Use as `dependencies=[Depends(limit("login", 20, 300))]`: at most `times` requests per visitor per `seconds`."""

    def check(request: Request) -> None:
        limiter.hit(f"{name}:{client_ip(request)}", times, seconds)

    return check
