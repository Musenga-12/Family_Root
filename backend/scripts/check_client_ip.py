"""Check that a deployed server counts sign-in attempts per visitor (TRUSTED_PROXY_HOPS), from the outside.

    python scripts/check_client_ip.py https://api.your-site.example            # step 1, from your computer
    python scripts/check_client_ip.py https://api.your-site.example --single   # step 2, from another network

Step 1 makes 21 failed sign-ins (unknown emails, so no account is affected), each claiming a new made-up address in
X-Forwarded-For. The server allows 20 per visitor address in 5 minutes, so the 21st must be refused: if it isn't,
the server believes addresses visitors write themselves (TRUSTED_PROXY_HOPS too high).
Step 2, within those 5 minutes from a different network (e.g. a phone's mobile data), makes one attempt. It must be
answered normally: if it is refused too, every visitor is counted as one (TRUSTED_PROXY_HOPS too low, often 0).

Your own address can't sign in for 5 minutes after step 1. Nothing secret is sent or printed.
See DEPLOY.md → Visitor addresses behind a proxy.
"""
import argparse
import secrets
import sys

import httpx

SIGN_IN_TRIES = 20  # per visitor address per 5 minutes: SIGN_IN_LIMIT in app/routers/auth.py
API = "/api/v1"


def attempt(client: httpx.Client, run: str, i: int, forwarded: str | None = None) -> int:
    headers = {"X-Forwarded-For": forwarded} if forwarded else {}
    r = client.post(f"{API}/auth/login", headers=headers,
                    json={"email": f"proxy-check-{run}-{i}@example.org", "password": "not-a-real-password"})
    return r.status_code


def check_made_up_addresses(client: httpx.Client) -> tuple[bool, str]:
    """Step 1. (passed, explanation)"""
    run = secrets.token_hex(4)
    codes = [attempt(client, run, i, f"198.18.{i}.{secrets.randbelow(250) + 1}") for i in range(SIGN_IN_TRIES + 1)]
    if 429 in codes[:SIGN_IN_TRIES]:
        return False, (f"Refused after {codes.index(429)} attempts, before the limit of {SIGN_IN_TRIES}: this address had "
                       "already been trying (an earlier run?). Wait 5 minutes and run step 1 again.")
    if any(c != 401 for c in codes[:SIGN_IN_TRIES]):
        return False, f"Unexpected answers {sorted(set(codes))}: is this the API's address, and is it running?"
    if codes[SIGN_IN_TRIES] != 429:
        return False, ("FAILED: made-up addresses were believed, so anyone can avoid the sign-in limit. Lower "
                       "TRUSTED_PROXY_HOPS by one and run step 1 again.")
    return True, ("PASSED: made-up addresses are ignored. Now, within 5 minutes, run step 2 (--single) from a different "
                  "network.")


def check_other_visitor(client: httpx.Client) -> tuple[bool, str]:
    """Step 2. (passed, explanation)"""
    code = attempt(client, secrets.token_hex(4), 0)
    if code == 401:
        return True, "PASSED: another visitor has their own limit. Both steps passed: TRUSTED_PROXY_HOPS is right."
    if code == 429:
        return False, ("FAILED: this visitor was refused because of step 1's attempts elsewhere, so every visitor shares "
                       "one limit. Raise TRUSTED_PROXY_HOPS by one, wait 5 minutes and run both steps again.")
    return False, f"Unexpected answer {code}: is this the API's address, and is it running?"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base_url", help="the API's public address, e.g. https://api.your-site.example")
    parser.add_argument("--single", action="store_true", help="step 2: one attempt, from a different network")
    args = parser.parse_args()
    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=20) as client:
        passed, message = (check_other_visitor if args.single else check_made_up_addresses)(client)
    print(message)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
