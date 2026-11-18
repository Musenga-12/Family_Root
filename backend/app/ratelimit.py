"""A small limit on how often sign-in, sign-up and password-reset requests can be tried, so nobody can guess
passwords, family codes or invitation links by trying thousands of them.

Counts are kept in memory, which works for one server process (the same assumption as realtime.py). With several
processes or servers, keep them in Redis (or similar) instead. Behind a proxy, start the server with
--proxy-headers (and --forwarded-allow-ips) so request.client is the visitor's address, not the proxy's.
"""
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
    return request.client.host if request.client else "unknown"


def limit(name: str, times: int, seconds: int):
    """Use as `dependencies=[Depends(limit("login", 20, 300))]`: at most `times` requests per visitor per `seconds`."""

    def check(request: Request) -> None:
        limiter.hit(f"{name}:{client_ip(request)}", times, seconds)

    return check
