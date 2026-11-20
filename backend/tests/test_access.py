"""Who may call what: signed-out visitors, roles, and other families."""
import re

import pytest

from app.main import app
from helpers import API, PNG, member_id, new_family, upload

PUBLIC = {"/auth/register", "/auth/login", "/auth/token", "/auth/family-code/verify", "/auth/forgot-password",
          "/auth/reset-password", "/auth/reset-password/status", "/auth/email-status", "/invites/by-token/{token}", "/uploads/{upload_id}/file"}
# From the OpenAPI schema: it lists every endpoint of every included router (app.routes keeps them nested).
ROUTES = [(m.upper(), path) for path, ops in app.openapi()["paths"].items() if path.startswith(API) for m in ops]
assert len(ROUTES) > 100


@pytest.mark.parametrize("method,path", ROUTES, ids=[f"{m} {p}" for m, p in ROUTES])
def test_every_private_route_needs_sign_in(client, method, path):
    if path[len(API):] in PUBLIC:
        pytest.skip("public on purpose")
    r = client.request(method, re.sub(r"\{[^}]+\}", "x1", path))
    assert r.status_code == 401, r.text
    assert r.json() == {"detail": "Not signed in"}


def test_public_routes_are_exactly_the_sign_in_ones():
    public = {p[len(API):] for _, p in ROUTES if p[len(API):] in PUBLIC}
    assert public == PUBLIC


VIEWER_CANNOT = [
    ("post", "/people", {"first": "A", "last": "B"}),
    ("post", "/memories", {"title": "T", "date": "2026", "alt": "a", "visibility": "Only Me (draft)"}),
    ("post", "/albums", {"title": "T"}),
    ("post", "/stories", {"title": "T", "text": "x"}),
    ("post", "/milestones", {"title": "T", "date": "2026"}),
    ("post", "/records", {"title": "T", "date": "2026", "text": "x"}),
    ("post", "/events", {"title": "T", "date": "2027-01-01"}),
    ("post", "/invites", {"name": "A", "email": "a@example.org"}),
    ("post", "/consents", {"person": "mary", "item": "x"}),
    ("post", "/polls", {"question": "Q", "options": ["a", "b"]}),
    ("post", "/prompts", {"question": "Q"}),
    ("get", "/admin/summary", None),
    ("get", "/admin/export", None),
    ("get", "/join-requests", None),
    ("delete", "/people/mary", None),
    ("delete", "/albums/a1", None),
]


@pytest.mark.parametrize("method,path,body", VIEWER_CANNOT, ids=[f"{m} {p}" for m, p, _ in VIEWER_CANNOT])
def test_viewer_role_limits(client, auth, method, path, body):
    r = client.request(method, API + path, headers=auth("anna"), json=body)
    assert r.status_code == 403, r.text
    assert r.json()["detail"].startswith("Needs role")


def test_viewer_cannot_upload(client, auth):
    assert upload(client, auth("anna")).status_code == 403


def test_viewer_can_still_take_part(client, auth):
    h = auth("anna")
    assert client.put(f"{API}/events/e2/rsvp", headers=h, json={"answer": "maybe"}).json()["rsvp"] == "maybe"
    assert client.put(f"{API}/polls/po1/vote", headers=h, json={"choice": 1}).json()["mine"] == 1
    assert client.post(f"{API}/stories/s1/reflections", headers=h, json={"text": "Lovely"}).status_code == 201
    assert client.post(f"{API}/people/mary/suggestions", headers=h, json={"field": "Occupation", "value": "Teacher"}).status_code == 201


@pytest.mark.parametrize("method,path", [("get", "/admin/summary"), ("get", "/join-requests"), ("patch", "/members/1"),
                                         ("delete", "/members/1"), ("post", "/members/1/reset-link"), ("get", "/admin/export")])
def test_admin_only_routes_refuse_a_custodian(client, auth, method, path):
    r = client.request(method, API + path, headers=auth("michael"), json={"role": "Admin"})
    assert r.status_code == 403


def test_custodian_cannot_make_themselves_admin(client, auth):
    me = member_id(client, auth("mary"), "michael")
    assert client.patch(f"{API}/members/{me}", headers=auth("michael"), json={"role": "Admin"}).status_code == 403


SAMPLE_IDS = ["/people/mary", "/memories/m1", "/albums/a1", "/stories/s1", "/milestones/t1", "/events/e2", "/records/r1",
              "/threads/c1", "/threads/c1/messages", "/stories/s1/reflections", "/events/e2/attendees", "/polls/po1/vote",
              "/consents/k1", "/join-requests/q1/approve", "/invites/i1/resend"]


def test_another_family_sees_none_of_this_one(client, auth):
    other = new_family(client)
    for path in SAMPLE_IDS:
        method = "put" if path.endswith("/vote") else "post" if path.endswith(("/approve", "/resend")) else \
            "patch" if path.startswith("/consents") else "get"
        r = client.request(method, API + path, headers=other, json={"choice": 0, "status": "given", "role": "Viewer"})
        assert r.status_code == 404, (path, r.status_code, r.text)
    # Only the founder's own tree entry; none of the sample family.
    assert [(p["first"], p["last"]) for p in client.get(API + "/people", headers=other).json()] == [("Fiona", "Campbell")]
    for listing in ["/memories", "/albums", "/stories", "/milestones", "/events", "/records", "/threads", "/consents"]:
        assert client.get(API + listing, headers=other).json() == [], listing
    assert [m["name"] for m in client.get(f"{API}/members", headers=other).json()] == ["Fiona Campbell"]
    mary = member_id(client, auth("mary"), "mary")
    assert client.patch(f"{API}/members/{mary}", headers=other, json={"role": "Viewer"}).status_code == 404
    assert client.post(f"{API}/threads", headers=other, json={"to": ["mary"], "text": "hi"}).status_code == 422


def test_another_familys_upload_cannot_be_used(client, auth):
    up = upload(client, auth("james"), PNG).json()
    other = new_family(client)
    r = client.post(f"{API}/memories", headers=other,
                    json={"title": "T", "date": "2026", "alt": "a", "consent": True, "upload_ids": [up["id"]]})
    assert r.status_code == 404
