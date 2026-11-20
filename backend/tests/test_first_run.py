"""A new visitor's first steps: creating an account, saying who they are in the tree, and the first Overview."""
import re

from helpers import API, bearer, login, new_family


def register(client, **body):
    return client.post(f"{API}/auth/register", json={"password": "long-enough-pw", **body})


def me(client, headers):
    return client.get(f"{API}/me", headers=headers).json()


# ---------- registration ----------

def test_a_blank_name_is_refused_not_a_server_error(client):
    r = register(client, name="   ", email="blank@example.org")
    assert r.status_code == 422 and isinstance(r.json()["detail"], list)


def test_a_one_word_name_still_gets_a_family_and_a_code(client):
    r = register(client, name="Musa", email="musa@example.org")
    assert r.status_code == 201 and r.json()["family_name"] == "Musa family"
    m = me(client, bearer(r.json()["access_token"]))
    assert re.fullmatch(r"MUS-\d{4}", m["family_code"])


def test_a_short_or_non_latin_surname_gets_a_padded_code(client):
    m = me(client, bearer(register(client, name="Li Na Wu", email="wu@example.org").json()["access_token"]))
    assert re.fullmatch(r"WUF-\d{4}", m["family_code"])
    m = me(client, bearer(register(client, name="Élise Ñ", email="n@example.org").json()["access_token"]))
    assert re.fullmatch(r"FAM-\d{4}", m["family_code"])


def test_family_name_is_tidied_and_limited(client):
    r = register(client, name="Ada Ross", email="ada@example.org", family_name="  The Ross family  ")
    assert r.json()["family_name"] == "The Ross family"
    r = register(client, name="Bo Ross", email="bo@example.org", family_name="   ")
    assert r.json()["family_name"] == "Ross family"  # blank means "use the default"
    assert register(client, name="Cy Ross", email="cy@example.org", family_name="x" * 81).status_code == 422


def test_overlong_passwords_are_refused(client):
    assert register(client, name="Long Pw", email="long@example.org", password="p" * 129).status_code == 422
    assert register(client, name="Long Pw", email="long@example.org", password="p" * 128).status_code == 201


def test_duplicate_email_does_not_make_a_second_account(client):
    assert register(client, name="Ada Ross", email="ada@example.org").status_code == 201
    r = register(client, name="Ada Again", email="ADA@example.org")
    assert r.status_code == 409 and "already exists" in r.json()["detail"]
    assert login(client, "ada@example.org", "long-enough-pw").status_code == 200


# ---------- the founder in the tree ----------

def test_the_founder_is_the_first_person_in_the_new_tree(client):
    headers = new_family(client)
    m = me(client, headers)
    people = client.get(f"{API}/people", headers=headers).json()
    assert m["person_id"] and [p["id"] for p in people] == [m["person_id"]]
    assert (people[0]["first"], people[0]["last"]) == ("Fiona", "Campbell")


def test_a_new_familys_overview_is_honest(client):
    o = client.get(f"{API}/overview", headers=new_family(client)).json()
    assert o["counts"] == {"people": 1, "memories": 0, "stories": 0, "unread_messages": 0}
    assert o["recent_memories"] == [] and o["recent_stories"] == []


# ---------- "this is me" ----------

def invited(client, auth, email="isla@example.org"):
    inv = client.post(f"{API}/invites", headers=auth("mary"), json={"name": "Isla", "email": email, "role": "Contributor"}).json()
    r = register(client, name="Isla Mackenzie", email=email, invite_token=inv["link"].split("invite=", 1)[1])
    return bearer(r.json()["access_token"])


def test_an_invited_relative_starts_unlinked_and_can_claim_themselves(client, auth):
    isla = invited(client, auth)
    assert me(client, isla)["person_id"] is None  # never guessed, so no duplicate tree entry
    r = client.patch(f"{API}/me", headers=isla, json={"person_id": "john"})
    assert r.status_code == 200 and r.json()["person_id"] == "john"


def test_a_person_with_an_account_cannot_be_claimed(client, auth):
    r = client.patch(f"{API}/me", headers=invited(client, auth), json={"person_id": "mary"})
    assert r.status_code == 409


def test_another_familys_person_cannot_be_claimed(client, auth):
    other = new_family(client)
    r = client.patch(f"{API}/me", headers=other, json={"person_id": "john"})
    assert r.status_code == 404
    theirs = me(client, other)["person_id"]
    assert client.patch(f"{API}/me", headers=auth("mary"), json={"person_id": theirs}).status_code == 404
    assert me(client, auth("mary"))["person_id"] == "mary"


def test_claiming_needs_an_account(client):
    assert client.patch(f"{API}/me", json={"person_id": "john"}).status_code == 401


# ---------- onboarding ----------

def test_an_approved_relative_gets_the_welcome_steps(client, auth):
    register(client, name="Ian Mackenzie", email="ian@example.org", family_code="MCK-8294")
    q = next(q for q in client.get(f"{API}/join-requests", headers=auth("mary")).json() if q["email"] == "ian@example.org")
    assert client.post(f"{API}/join-requests/{q['id']}/approve", headers=auth("mary"), json={"role": "Viewer"}).status_code == 200
    ian = bearer(login(client, "ian@example.org", "long-enough-pw").json()["access_token"])
    assert me(client, ian)["onboarding_done"] is False
    assert client.patch(f"{API}/me", headers=ian, json={"onboarding_done": True}).json()["onboarding_done"] is True
