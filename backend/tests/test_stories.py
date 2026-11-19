"""Stories: filtering, editing, verifying, removing and restoring, recordings, and reflections."""
from helpers import API, WEBM, upload


def written(client, headers, **extra):
    r = client.post(f"{API}/stories", headers=headers, json={"title": "The boat", "text": "It was a cold morning in 1962...", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def ids(client, headers, query=""):
    return [s["id"] for s in client.get(f"{API}/stories{query}", headers=headers).json()]


def test_story_input_is_checked(client, auth):
    james = auth("james")
    assert client.post(f"{API}/stories", headers=james, json={"title": "   ", "text": "Hello"}).status_code == 422
    assert client.post(f"{API}/stories", headers=james, json={"title": "X", "text": "y", "visibility": "Everyone"}).status_code == 422
    # A recording needs its length.
    audio = upload(client, james, data=WEBM, ctype="audio/webm", name="rec.webm").json()
    r = client.post(f"{API}/stories", headers=james, json={"title": "Recorded", "upload_id": audio["id"]})
    assert r.status_code == 422 and "duration" in r.json()["detail"]
    ok = client.post(f"{API}/stories", headers=james, json={"title": "Recorded", "upload_id": audio["id"], "duration": 30,
                                                             "prompt": "What was school like?"})
    assert ok.status_code == 201 and ok.json()["kind"] == "audio" and "What was school like?" in ok.json()["excerpt"]


def test_story_list_filters(client, auth):
    james = auth("james")
    assert set(ids(client, james, "?kind=written")) >= {"s3"} and "s1" not in ids(client, james, "?kind=written")
    assert set(ids(client, james, "?category=Elder Oral Histories")) == {"s1", "s2"}
    assert set(ids(client, james, "?by=sarah")) == {"s3", "s5"}
    assert ids(client, james, "?q=bicycle") == ["s3"]
    assert ids(client, james, "?q=nothing-like-this") == []


def test_draft_stories_stay_with_their_author(client, auth):
    james, anna = auth("james"), auth("anna")
    draft = written(client, james, visibility="Only Me (private draft)")  # the Recording Studio's label
    assert draft["visibility"] == "Only Me (draft)"
    assert draft["id"] in ids(client, james)
    assert draft["id"] not in ids(client, anna)
    assert client.get(f"{API}/stories/{draft['id']}", headers=anna).status_code == 404


def test_editing_a_story(client, auth):
    sarah, james = auth("sarah"), auth("james")
    assert client.patch(f"{API}/stories/s3", headers=james, json={"title": "Mine now"}).status_code == 403

    r = client.patch(f"{API}/stories/s3", headers=sarah, json={"title": "  The lost bicycle ", "category": "Traditions & Recipes",
                                                               "text": "Michael left it at the station. " * 10})
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["title"] == "The lost bicycle" and s["category"] == "Traditions & Recipes"
    assert s["excerpt"].startswith("Michael left it") and len(s["excerpt"]) <= 181

    assert client.patch(f"{API}/stories/s3", headers=sarah, json={"text": "   "}).status_code == 422  # a written story needs text
    assert client.patch(f"{API}/stories/s3", headers=sarah, json={"category": "Gossip"}).status_code == 422
    assert client.patch(f"{API}/stories/s3", headers=sarah, json={"visibility": "Everyone"}).status_code == 422
    custom = client.patch(f"{API}/stories/s3", headers=sarah, json={"text": "New words", "excerpt": "My own summary"}).json()
    assert custom["excerpt"] == "My own summary"

    # A recording's transcript may be emptied; it keeps its old excerpt.
    s5 = client.get(f"{API}/stories/s5", headers=sarah).json()
    cleared = client.patch(f"{API}/stories/s5", headers=sarah, json={"text": ""})
    assert cleared.status_code == 200 and cleared.json()["excerpt"] == s5["excerpt"]


def test_verify_and_reopen_a_story(client, auth):
    michael = auth("michael")
    s = written(client, auth("james"))
    assert client.post(f"{API}/stories/{s['id']}/verify", headers=michael).json()["verified"] is True
    assert client.post(f"{API}/stories/{s['id']}/reopen", headers=auth("james")).status_code == 403
    r = client.post(f"{API}/stories/{s['id']}/reopen", headers=michael)
    assert r.status_code == 200 and r.json()["verified"] is False


def test_removing_and_restoring_a_story(client, auth):
    sarah, james = auth("sarah"), auth("james")
    assert client.delete(f"{API}/stories/s3", headers=james).status_code == 403
    assert client.delete(f"{API}/stories/s3", headers=sarah).status_code == 204
    assert client.get(f"{API}/stories/s3", headers=james).status_code == 404
    assert "s3" not in ids(client, james)
    assert client.post(f"{API}/stories/s3/restore", headers=james).status_code == 403
    r = client.post(f"{API}/stories/s3/restore", headers=sarah)
    assert r.status_code == 200 and r.json()["id"] == "s3"
    assert "s3" in ids(client, james)


def test_reflections(client, auth):
    james, anna = auth("james"), auth("anna")
    s = written(client, james)
    assert client.get(f"{API}/stories/{s['id']}/reflections", headers=anna).json() == []
    assert client.post(f"{API}/stories/{s['id']}/reflections", headers=anna, json={"text": "   "}).status_code == 422
    r = client.post(f"{API}/stories/{s['id']}/reflections", headers=anna, json={"text": " Lovely "}).json()
    listed = client.get(f"{API}/stories/{s['id']}/reflections", headers=james).json()
    assert [(x["id"], x["text"], x["by"], x["can_delete"]) for x in listed] == [(r["id"], "Lovely", "anna", False)]
    assert client.get(f"{API}/stories/{s['id']}/reflections", headers=auth("michael")).json()[0]["can_delete"] is True

    assert client.delete(f"{API}/stories/{s['id']}/reflections/no-such-reflection", headers=anna).status_code == 404
    assert client.delete(f"{API}/stories/s3/reflections/{r['id']}", headers=anna).status_code == 404  # belongs to another story
    assert client.delete(f"{API}/stories/{s['id']}/reflections/{r['id']}", headers=auth("michael")).status_code == 204
    assert client.delete(f"{API}/stories/{s['id']}/reflections/{r['id']}", headers=anna).status_code == 404  # already removed
    assert client.get(f"{API}/stories/{s['id']}", headers=james).json()["reflections"] == 0


def test_recording_studio_checks_before_storing(client, auth):
    james = auth("james")

    def record(**form):
        return client.post(f"{API}/stories/audio", headers=james, files={"file": ("rec.webm", WEBM, "audio/webm")},
                           data={"title": "Grandad's song", "duration": "42", **form})

    assert record(title="   ").status_code == 422
    assert record(category="Gossip").status_code == 422
    r = record(category="Traditions & Recipes", visibility="Family circle", transcript="He sang it every Hogmanay")
    assert r.status_code == 201, r.text
    assert r.json()["category"] == "Traditions & Recipes" and r.json()["visibility"] == "All Family Branches"
    assert r.json()["excerpt"] == "He sang it every Hogmanay"
