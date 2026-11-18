"""Family administration: roles, join requests, invitations and help with passwords."""
from helpers import API, login, member_id


def test_summary(client, auth):
    s = client.get(f"{API}/admin/summary", headers=auth("mary")).json()
    assert s["members"] == 8 and s["admins"] == 2 and s["join_requests"] == 2 and s["invites"] == 1


def test_members_list_shows_emails_to_admins_only(client, auth):
    as_admin = client.get(f"{API}/members", headers=auth("mary")).json()
    as_viewer = client.get(f"{API}/members", headers=auth("anna")).json()
    assert all(m["email"] for m in as_admin) and all(m["email"] is None for m in as_viewer)
    assert [m["role"] for m in as_admin][:2] == ["Admin", "Admin"]


def test_roles_and_the_last_admin(client, auth):
    mary = auth("mary")
    james = member_id(client, mary, "james")
    assert client.patch(f"{API}/members/{james}", headers=mary, json={"role": "Custodian"}).json()["role"] == "Custodian"
    assert client.patch(f"{API}/members/{james}", headers=mary, json={"role": "Boss"}).status_code == 422
    sarah, me = member_id(client, mary, "sarah"), member_id(client, mary, "mary")
    assert client.patch(f"{API}/members/{sarah}", headers=mary, json={"role": "Viewer"}).status_code == 200
    r = client.patch(f"{API}/members/{me}", headers=mary, json={"role": "Viewer"})
    assert r.status_code == 422 and "at least one Admin" in r.json()["detail"]
    assert client.delete(f"{API}/members/{me}", headers=mary).status_code == 422  # can't remove yourself


def test_remove_and_restore_a_member(client, auth):
    mary = auth("mary")
    emma = member_id(client, mary, "emma")
    assert client.delete(f"{API}/members/{emma}", headers=mary).status_code == 204
    assert "emma" not in [m["person_id"] for m in client.get(f"{API}/members", headers=mary).json()]
    assert client.post(f"{API}/members/{emma}/reset-link", headers=mary).status_code == 422
    assert client.post(f"{API}/members/{emma}/restore", headers=mary).json()["removed"] is False
    assert login(client, "emma@example.com").status_code == 200


def test_approving_a_join_request_and_undo(client, auth):
    mary = auth("mary")
    assert client.post(f"{API}/join-requests/q1/approve", headers=mary, json={"role": "Admin"}).status_code == 422
    m = client.post(f"{API}/join-requests/q1/approve", headers=mary, json={"role": "Contributor"}).json()
    assert m["role"] == "Contributor" and m["email"] == "fiona.campbell@example.com"
    assert client.post(f"{API}/join-requests/q1/approve", headers=mary, json={}).status_code == 422  # already approved
    # The sample request has no password: an Admin gives a one-time link (this also checks link expiry is read correctly).
    link = client.post(f"{API}/members/{m['user_id']}/reset-link", headers=mary).json()
    assert link["expires"].endswith("Z")
    token = link["link"].split("token=")[1]
    assert client.post(f"{API}/auth/reset-password", json={"token": token, "password": "fiona-new-password"}).status_code == 200
    assert login(client, "fiona.campbell@example.com", "fiona-new-password").status_code == 200
    # Undo the approval: the account loses access again.
    assert client.post(f"{API}/join-requests/q1/reopen", headers=mary).json()["status"] == "pending"
    assert login(client, "fiona.campbell@example.com", "fiona-new-password").status_code == 403


def test_declining_a_join_request(client, auth):
    mary = auth("mary")
    assert client.post(f"{API}/join-requests/q2/decline", headers=mary).status_code == 204
    assert "q2" not in [q["id"] for q in client.get(f"{API}/join-requests", headers=mary).json()]
    assert client.post(f"{API}/join-requests/q2/decline", headers=mary).status_code == 422


def test_invitations(client, auth):
    james, michael, mary = auth("james"), auth("michael"), auth("mary")
    inv = client.post(f"{API}/invites", headers=james, json={"name": "Ross", "email": "ross@example.org", "role": "Admin"}).json()
    assert inv["role"] == "Viewer" and inv["link"]  # only Admins choose the role
    assert client.post(f"{API}/invites", headers=james, json={"name": "Ross", "email": "ROSS@example.org"}).status_code == 409
    assert client.post(f"{API}/invites", headers=james, json={"name": "Mary", "email": "mary@example.com"}).status_code == 409
    assert client.post(f"{API}/invites", headers=james, json={"name": "X", "email": "not-an-email"}).status_code == 422
    assert client.delete(f"{API}/invites/{inv['id']}", headers=michael).status_code == 403  # not the sender, not an Admin
    assert [i["id"] for i in client.get(f"{API}/invites", headers=michael).json()] == []  # others' invitations aren't listed
    assert client.post(f"{API}/invites/{inv['id']}/resend", headers=james).json()["status"] == "pending"
    assert client.delete(f"{API}/invites/{inv['id']}", headers=mary).status_code == 204
    assert client.post(f"{API}/invites/{inv['id']}/resend", headers=james).status_code == 422
    assert client.post(f"{API}/invites/{inv['id']}/restore", headers=james).json()["status"] == "pending"
    listed = client.get(f"{API}/invites", headers=mary).json()
    assert {i["id"] for i in listed} == {"i1", inv["id"]} and all(i["link"] for i in listed)
