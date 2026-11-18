"""Creating, changing, removing and restoring what's in the archive, and refusing bad input with a clear 422."""
import pytest

from helpers import API


def test_people_tree_and_directory(client, auth):
    james, michael = auth("james"), auth("michael")
    r = client.post(f"{API}/people", headers=james, json={"first": "Lily", "last": "Mackenzie", "born": "2024-03-14", "relation": "child",
                                                          "relative_id": "sarah"})
    assert r.status_code == 201
    lily = r.json()
    assert lily["parents"] == ["sarah", "david"] and lily["gen"] == 4
    # Lily is a protected minor: James (her uncle) sees her name only, her mother sees the change.
    assert client.patch(f"{API}/people/{lily['id']}", headers=james, json={"occupation": "Pupil"}).json()["restricted"] is True
    assert client.get(f"{API}/people/{lily['id']}", headers=auth("sarah")).json()["occupation"] == "Pupil"
    assert client.patch(f"{API}/people/{lily['id']}", headers=james, json={"born": "2024-13-40"}).status_code == 422
    assert client.patch(f"{API}/people/{lily['id']}", headers=james, json={"parents": ["nobody"]}).status_code == 422
    assert client.patch(f"{API}/people/{lily['id']}", headers=james, json={"spouse": lily["id"]}).status_code == 422
    assert client.delete(f"{API}/people/{lily['id']}", headers=james).status_code == 403  # Contributors don't remove people
    assert client.delete(f"{API}/people/{lily['id']}", headers=michael).status_code == 204
    assert client.get(f"{API}/people/{lily['id']}", headers=james).status_code == 404
    assert client.post(f"{API}/people/{lily['id']}/restore", headers=michael).status_code == 200
    assert client.put(f"{API}/people/{lily['id']}/favorite", headers=james).status_code == 204
    assert next(p for p in client.get(f"{API}/people", headers=james).json() if p["id"] == lily["id"])["fav"] is True
    assert client.post(f"{API}/people", headers=james, json={"first": "X", "last": "Y", "relation": "child"}).status_code == 422


NULL_PATCHES = [
    ("/people/sarah", "michael", {"first": None}),
    ("/people/sarah", "michael", {"tags": None}),
    ("/memories/m1", "mary", {"title": None}),
    ("/memories/m1", "mary", {"visibility": None}),
    ("/memories/m1", "mary", {"date": None}),
    ("/albums/a1", "mary", {"title": None}),
    ("/albums/a1", "mary", {"title": "   "}),
    ("/stories/s1", "mary", {"title": None}),
    ("/stories/s1", "mary", {"category": None}),
    ("/stories/s1", "mary", {"visibility": None}),
    ("/milestones/t1", "mary", {"type": None}),
    ("/milestones/t1", "mary", {"title": None}),
    ("/milestones/t1", "mary", {"people": None}),
    ("/records/r1", "mary", {"category": None}),
    ("/records/r1", "mary", {"title": None}),
    ("/records/r1", "mary", {"visibility": None}),
    ("/events/e2", "mary", {"title": None}),
    ("/events/e2", "mary", {"date": None}),
    ("/events/e2", "mary", {"extra_guests": None}),
]


@pytest.mark.parametrize("path,who,body", NULL_PATCHES, ids=[f"{p} {list(b)[0]}" for p, _, b in NULL_PATCHES])
def test_emptying_a_required_field_is_a_clear_422(client, auth, path, who, body):
    r = client.patch(API + path, headers=auth(who), json=body)
    assert r.status_code == 422, r.text
    assert "can't be empty" in r.json()["detail"]


def test_memories(client, auth):
    james = auth("james")
    body = {"title": "Picnic", "date": "2026-06", "alt": "On a blanket", "visibility": "All Family Branches", "tagged": ["mary"]}
    assert client.post(f"{API}/memories", headers=james, json=body).status_code == 422  # consent box not ticked
    assert client.post(f"{API}/memories", headers=james, json={**body, "consent": True, "date": "June"}).status_code == 422
    assert client.post(f"{API}/memories", headers=james, json={**body, "consent": True, "tagged": ["nobody"]}).status_code == 422
    m = client.post(f"{API}/memories", headers=james, json={**body, "consent": True}).json()[0]
    assert m["can_edit"] is True and m["tagged"] == ["mary"]
    assert client.patch(f"{API}/memories/{m['id']}", headers=auth("emma"), json={"title": "Mine"}).status_code == 403
    assert client.patch(f"{API}/memories/{m['id']}", headers=auth("michael"), json={"title": "Loch picnic"}).json()["title"] == "Loch picnic"
    assert client.get(f"{API}/memories?q=loch", headers=james).json()[0]["id"] == m["id"]
    assert client.put(f"{API}/memories/{m['id']}/favorite", headers=james).status_code == 204
    assert [x["id"] for x in client.get(f"{API}/memories?fav=true", headers=james).json()] == [m["id"]]
    assert client.delete(f"{API}/memories/{m['id']}", headers=james).status_code == 204
    assert client.get(f"{API}/memories/{m['id']}", headers=james).status_code == 404
    assert client.post(f"{API}/memories/{m['id']}/restore", headers=james).status_code == 200


def test_albums(client, auth):
    james = auth("james")
    a = client.post(f"{API}/albums", headers=james, json={"title": " Summer ", "items": ["m1", "m2"]}).json()
    assert a["title"] == "Summer" and a["items"] == ["m1", "m2"] and a["count"] == 2
    assert client.post(f"{API}/albums", headers=james, json={"title": "x", "items": ["nope"]}).status_code == 422
    assert client.put(f"{API}/albums/{a['id']}/items", headers=james, json={"items": ["m3"]}).json()["items"] == ["m3"]
    assert client.delete(f"{API}/albums/{a['id']}", headers=james).status_code == 403
    assert client.delete(f"{API}/albums/{a['id']}", headers=auth("mary")).status_code == 204
    assert client.get(f"{API}/albums/{a['id']}", headers=james).status_code == 404


def test_stories_loves_and_reflections(client, auth):
    james, anna = auth("james"), auth("anna")
    assert client.post(f"{API}/stories", headers=james, json={"title": "Empty"}).status_code == 422
    assert client.post(f"{API}/stories", headers=james, json={"title": "X", "text": "y", "category": "Gossip"}).status_code == 422
    s = client.post(f"{API}/stories", headers=james, json={"title": "The boat", "text": "It was a cold morning in 1962..."}).json()
    assert s["kind"] == "written" and s["category"] == "Written Memories" and s["excerpt"].startswith("It was")
    assert client.put(f"{API}/stories/{s['id']}/love", headers=anna).json()["loves"] == 1
    assert client.put(f"{API}/stories/{s['id']}/love", headers=anna).json()["loves"] == 1  # once per person
    assert client.delete(f"{API}/stories/{s['id']}/love", headers=anna).json()["loves"] == 0
    r = client.post(f"{API}/stories/{s['id']}/reflections", headers=anna, json={"text": "I never knew!"}).json()
    assert client.get(f"{API}/stories/{s['id']}", headers=james).json()["reflections"] == 1
    assert client.get(f"{API}/notifications", headers=james).json()["items"][0]["kind"] == "story.reflection"
    assert client.delete(f"{API}/stories/{s['id']}/reflections/{r['id']}", headers=auth("emma")).status_code == 403
    assert client.delete(f"{API}/stories/{s['id']}/reflections/{r['id']}", headers=anna).status_code == 204
    assert client.post(f"{API}/stories/{s['id']}/verify", headers=james).status_code == 403
    assert client.post(f"{API}/stories/{s['id']}/verify", headers=auth("michael")).json()["verified"] is True
    assert client.patch(f"{API}/stories/{s['id']}", headers=james, json={"visibility": "Mackenzie Kinship Circle"}).json()["visibility"] == \
        "All Family Branches"


def test_milestones(client, auth):
    james = auth("james")
    m = client.post(f"{API}/milestones", headers=james, json={"type": "Weddings", "title": "Wedding", "date": "2025-06-01", "people": ["james"]}).json()
    assert m["icon"] == "favorite" and m["verified"] is False  # a contributor's date waits for a curator
    assert client.post(f"{API}/milestones", headers=james, json={"type": "Parties", "title": "x", "date": "2025"}).status_code == 422
    assert client.post(f"{API}/milestones/{m['id']}/verify", headers=james).status_code == 403
    assert client.post(f"{API}/milestones/{m['id']}/verify", headers=auth("michael")).json()["verified"] is True
    assert client.patch(f"{API}/milestones/{m['id']}", headers=james, json={"date": "2025-06-02"}).json()["verified"] is False
    assert [x["id"] for x in client.get(f"{API}/milestones?from_year=2025&to_year=2025&person=james", headers=james).json()] == [m["id"]]


def test_records_and_sealed_capsules(client, auth):
    james, michael = auth("james"), auth("michael")
    r = client.post(f"{API}/records", headers=james, json={"title": "Letter", "date": "1958-04", "text": "Dear Margaret"}).json()
    assert r["status"] == "review" and r["custodian"] == "james"
    assert client.post(f"{API}/records/{r['id']}/verify", headers=james).status_code == 403  # needs a second pair of eyes
    assert client.post(f"{API}/records/{r['id']}/verify", headers=michael).json()["status"] == "verified"
    assert client.patch(f"{API}/records/{r['id']}", headers=james, json={"text": "Dear Margaret,"}).json()["status"] == "review"
    sealed = client.get(f"{API}/records/r7", headers=james).json()
    assert sealed["sealed"] is True and sealed["text"] == "" and sealed["source"] is None
    assert client.patch(f"{API}/records/r7", headers=auth("mary"), json={"title": "Open it"}).status_code == 403
    cap = client.post(f"{API}/records", headers=james, json={"title": "For 2040", "date": "2026", "text": "Hello future", "sealedUntil": "2040-01-01"}).json()
    assert cap["category"] == "Time capsules" and cap["text"] == "Hello future"  # its author can read it
    assert client.get(f"{API}/records/{cap['id']}", headers=michael).json()["text"] == ""
    assert client.get(f"{API}/records?q=future", headers=michael).json() == []  # sealed text isn't searchable
    assert client.post(f"{API}/records", headers=james, json={"title": "x", "date": "2026", "text": "y", "sealedUntil": "2001-01-01"}).status_code == 422


def test_events_and_calendar(client, auth):
    james, anna = auth("james"), auth("anna")
    e = client.post(f"{API}/events", headers=james, json={"title": "Lunch", "date": "2027-01-10", "time": "13:00", "extra_guests": 2}).json()
    assert e["attending"] == 3 and e["going"] is True and e["sub"] == "13:00"
    assert client.post(f"{API}/events", headers=james, json={"title": "x", "date": "2027-02-30"}).status_code == 422
    assert client.post(f"{API}/events", headers=james, json={"title": "x", "date": "2027-02-03", "time": "25:00"}).status_code == 422
    assert client.put(f"{API}/events/{e['id']}/rsvp", headers=anna, json={"answer": "maybe"}).json()["maybe"] == 1
    assert client.put(f"{API}/events/{e['id']}/rsvp", headers=anna, json={"answer": "perhaps"}).status_code == 422
    assert [a["answer"] for a in client.get(f"{API}/events/{e['id']}/attendees", headers=anna).json()] == ["yes", "maybe"]
    assert client.delete(f"{API}/events/{e['id']}", headers=anna).status_code == 403
    assert client.delete(f"{API}/events/{e['id']}", headers=james).status_code == 204
    assert client.put(f"{API}/events/{e['id']}/rsvp", headers=anna).status_code == 422  # cancelled
    cal = client.get(f"{API}/calendar?from=2027-01-01&to=2027-12-31", headers=james).json()
    assert {i["kind"] for i in cal} >= {"birthday", "gathering"} and [i["date"] for i in cal] == sorted(i["date"] for i in cal)
    assert client.get(f"{API}/calendar?from=2027-02-01&to=2027-01-01", headers=james).status_code == 422
    assert client.get(f"{API}/calendar?from=2027-01-01&to=2029-01-01", headers=james).status_code == 422


def test_overview_poll_prompt_and_mood(client, auth):
    anna, michael = auth("anna"), auth("michael")
    ov = client.get(f"{API}/overview", headers=anna).json()
    assert set(ov) == {"counts", "upcoming", "next_birthday", "recent_memories", "recent_stories", "poll", "prompt"}
    assert client.put(f"{API}/polls/po1/vote", headers=anna, json={"choice": 9}).status_code == 422
    p = client.post(f"{API}/polls", headers=michael, json={"question": "Where?", "options": ["Here", "There"]}).json()
    assert client.get(f"{API}/polls/current", headers=anna).json()["id"] == p["id"]
    assert client.put(f"{API}/polls/po1/vote", headers=anna, json={"choice": 0}).status_code == 422  # the old one closed
    assert client.post(f"{API}/polls", headers=michael, json={"question": "Q", "options": ["a", "a"]}).status_code == 422
    reply = client.post(f"{API}/prompts/pr1/replies", headers=anna, json={"text": "Snowball fights"}).json()
    assert client.delete(f"{API}/prompts/pr1/replies/{reply['id']}", headers=auth("james")).status_code == 403
    assert client.put(f"{API}/mood", headers=anna, json={"mood": "grateful"}).json()["mine"] == "grateful"
    assert client.put(f"{API}/mood", headers=anna, json={"mood": "angry"}).status_code == 422


def test_suggestions(client, auth):
    s = client.post(f"{API}/people/mary/suggestions", headers=auth("anna"), json={"field": "Birth place", "value": "Perth"}).json()
    assert client.post(f"{API}/people/mary/suggestions", headers=auth("anna"), json={"field": "Shoe size", "value": "6"}).status_code == 422
    assert client.patch(f"{API}/suggestions/{s['id']}", headers=auth("james"), json={"status": "accepted"}).status_code == 403
    assert client.patch(f"{API}/suggestions/{s['id']}", headers=auth("michael"), json={"status": "accepted"}).json()["status"] == "accepted"
    assert client.get(f"{API}/notifications", headers=auth("anna")).json()["items"][0]["kind"] == "suggestion.decided"
    assert [x["id"] for x in client.get(f"{API}/suggestions?status=", headers=auth("anna")).json()] == [s["id"]]
