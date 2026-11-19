"""The family tree, memories and albums: relations, favourites, filters, and who may remove or restore."""
from helpers import API

SHARED = {"title": "Picnic", "date": "2026-05", "alt": "A picnic by the loch", "visibility": "All Family Branches", "consent": True}


def ids(client, path, headers):
    return [x["id"] for x in client.get(API + path, headers=headers).json()]


# ---------- people ----------

def test_adding_a_parent_or_a_spouse_links_both_people(client, auth):
    james = auth("james")
    newcomer = client.post(f"{API}/people", headers=james, json={"first": "Isla", "last": "Ross", "born": "1950"})
    assert newcomer.status_code == 201, newcomer.text
    isla = newcomer.json()

    parent = client.post(f"{API}/people", headers=james, json={"first": "Hugh", "last": "Ross", "relation": "parent", "relative_id": isla["id"]})
    assert parent.status_code == 201, parent.text
    assert parent.json()["gen"] == isla["gen"] - 1
    assert client.get(f"{API}/people/{isla['id']}", headers=james).json()["parents"] == [parent.json()["id"]]

    spouse = client.post(f"{API}/people", headers=james, json={"first": "Ewan", "last": "Ross", "relation": "spouse", "relative_id": isla["id"]})
    assert spouse.status_code == 201, spouse.text
    assert spouse.json()["spouse"] == isla["id"] and spouse.json()["gen"] == isla["gen"]
    assert client.get(f"{API}/people/{isla['id']}", headers=james).json()["spouse"] == spouse.json()["id"]

    assert client.post(f"{API}/people", headers=james, json={"first": "X", "last": "Y", "relation": "spouse",
                                                             "relative_id": "nobody"}).status_code == 404


def test_verifying_reopening_and_clearing_a_date(client, auth):
    michael = auth("michael")
    assert client.post(f"{API}/people/sarah/reopen", headers=michael).json()["pending"] is True
    assert client.post(f"{API}/people/sarah/verify", headers=michael).json()["pending"] is False
    assert client.post(f"{API}/people/sarah/verify", headers=auth("james")).status_code == 403
    assert client.patch(f"{API}/people/sarah", headers=michael, json={"died": None}).json()["died"] is None
    assert client.post(f"{API}/people/nobody/restore", headers=michael).status_code == 404


def test_unstarring_a_person(client, auth):
    james = auth("james")
    assert client.put(f"{API}/people/sarah/favorite", headers=james).status_code == 204
    assert client.put(f"{API}/people/sarah/favorite", headers=james).status_code == 204  # once is enough
    assert client.delete(f"{API}/people/sarah/favorite", headers=james).status_code == 204
    assert next(p for p in client.get(f"{API}/people", headers=james).json() if p["id"] == "sarah")["fav"] is False
    assert client.delete(f"{API}/people/sarah/favorite", headers=james).status_code == 204  # nothing to take back


# ---------- memories ----------

def test_memory_input_is_checked(client, auth):
    james = auth("james")
    assert client.post(f"{API}/memories", headers=james, json={**SHARED, "visibility": "Everyone"}).status_code == 422
    assert client.post(f"{API}/memories", headers=james, json={**SHARED, "title": "   "}).status_code == 422
    assert client.post(f"{API}/memories", headers=james, json={**SHARED, "alt": ""}).status_code == 422


def test_someone_who_opted_out_of_tagging_cant_be_tagged(client, auth):
    james = auth("james")
    m = client.post(f"{API}/memories", headers=james, json=SHARED).json()[0]
    tagged = client.patch(f"{API}/memories/{m['id']}", headers=james, json={"tagged": ["michael"]})
    assert tagged.status_code == 200 and tagged.json()["tagged"] == ["michael"]

    assert client.patch(f"{API}/privacy/mine", headers=auth("sarah"), json={"tagging": False}).status_code == 200
    r = client.patch(f"{API}/memories/{m['id']}", headers=james, json={"tagged": ["michael", "sarah"]})
    assert r.status_code == 422 and "chosen not to be tagged" in r.json()["detail"]
    assert client.get(f"{API}/memories/{m['id']}", headers=james).json()["tagged"] == ["michael"]


def test_memory_list_filters(client, auth):
    james = auth("james")
    m = client.post(f"{API}/memories", headers=james, json={**SHARED, "tagged": ["michael"]}).json()[0]
    of_type = client.get(f"{API}/memories?type={m['type']}", headers=james).json()
    assert m["id"] in {x["id"] for x in of_type} and all(x["type"] == m["type"] for x in of_type)
    with_michael = client.get(f"{API}/memories?tagged=michael", headers=james).json()
    assert m["id"] in {x["id"] for x in with_michael} and all("michael" in x["tagged"] for x in with_michael)
    assert m["id"] not in ids(client, "/memories?tagged=emma", james)


def test_only_the_author_or_a_moderator_removes_a_memory(client, auth):
    james, emma = auth("james"), auth("emma")
    m = client.post(f"{API}/memories", headers=james, json=SHARED).json()[0]
    assert client.delete(f"{API}/memories/{m['id']}", headers=emma).status_code == 403
    assert client.delete(f"{API}/memories/{m['id']}", headers=james).status_code == 204
    assert client.post(f"{API}/memories/{m['id']}/restore", headers=emma).status_code == 403
    assert m["id"] not in ids(client, "/memories", james)
    assert client.post(f"{API}/memories/{m['id']}/restore", headers=james).status_code == 200


def test_unfavouriting_a_memory(client, auth):
    james = auth("james")
    assert client.put(f"{API}/memories/m1/favorite", headers=james).status_code == 204
    assert ids(client, "/memories?fav=true", james) == ["m1"]
    assert client.delete(f"{API}/memories/m1/favorite", headers=james).status_code == 204
    assert ids(client, "/memories?fav=true", james) == []
    assert client.delete(f"{API}/memories/m1/favorite", headers=james).status_code == 204  # nothing to take back


# ---------- albums ----------

def test_creating_and_renaming_an_album(client, auth):
    james = auth("james")
    assert client.post(f"{API}/albums", headers=james, json={"title": "   "}).status_code == 422
    a = client.post(f"{API}/albums", headers=james, json={"title": "Summer", "items": ["m1"]})
    assert a.status_code == 201, a.text
    r = client.patch(f"{API}/albums/{a.json()['id']}", headers=james, json={"title": "  Summer 2026 ", "note": "The whole week"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Summer 2026" and r.json()["note"] == "The whole week" and r.json()["items"] == ["m1"]
    assert client.patch(f"{API}/albums/{a.json()['id']}", headers=auth("anna"), json={"title": "Mine"}).status_code == 403
    assert client.patch(f"{API}/albums/no-such-album", headers=james, json={"title": "x"}).status_code == 404
