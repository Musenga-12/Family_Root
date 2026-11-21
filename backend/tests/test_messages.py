"""Conversations: starting, sending, reading, reacting, deleting, leaving; and who can't get in."""
from helpers import API, member_id


def threads(client, headers) -> dict:
    return {t["id"]: t for t in client.get(f"{API}/threads", headers=headers).json()}


def test_thread_list_as_seeded(client, auth):
    ts = client.get(f"{API}/threads", headers=auth("mary")).json()
    assert {t["id"] for t in ts} == {"c1", "c2", "c3", "c4"}
    pinned = [t["pinned"] for t in ts]
    assert pinned == sorted(pinned, reverse=True)  # pinned first
    c2 = next(t for t in ts if t["id"] == "c2")
    assert c2["group"] is False and c2["title"] == "Sarah Mackenzie"
    assert set(c2["members"]) == {"mary", "sarah"} and c2["last"]["at"].endswith("Z")


def test_private_chat_from_start_to_read(client, auth):
    mary, james = auth("mary"), auth("james")
    r = client.post(f"{API}/threads", headers=mary, json={"to": ["james"], "text": "  Dinner on Sunday?  "})
    assert r.status_code == 201
    t = r.json()
    assert t["group"] is False and t["title"] == "James Mackenzie" and t["last"]["text"] == "Dinner on Sunday?"
    assert t["last"]["status"] == "delivered"
    assert threads(client, james)[t["id"]]["unread"] == 1
    assert client.post(f"{API}/threads/{t['id']}/read", headers=james).status_code == 204
    assert threads(client, james)[t["id"]]["unread"] == 0
    assert client.get(f"{API}/threads/{t['id']}/messages", headers=mary).json()["messages"][-1]["status"] == "read"
    # Writing to the same person again reuses the chat.
    again = client.post(f"{API}/threads", headers=mary, json={"to": ["james"], "text": "Or Saturday?"}).json()
    assert again["id"] == t["id"]


def test_group_chat(client, auth):
    r = client.post(f"{API}/threads", headers=auth("mary"), json={"to": ["james", "emma"], "text": "Plans?"})
    t = r.json()
    assert t["group"] is True and t["title"] == "Mary, James, Emma" and len(t["members"]) == 3
    renamed = client.patch(f"{API}/threads/{t['id']}", headers=auth("emma"), json={"title": "Weekend"})
    assert renamed.json()["title"] == "Weekend"
    assert client.patch(f"{API}/threads/c2", headers=auth("mary"), json={"title": "Nope"}).status_code == 422  # 1-to-1


def test_paging_and_search(client, auth):
    h = auth("mary")
    all_msgs = client.get(f"{API}/threads/c1/messages", headers=h).json()["messages"]
    page = client.get(f"{API}/threads/c1/messages?limit=2", headers=h).json()
    assert page["messages"] == all_msgs[-2:] and page["has_more"] == (len(all_msgs) > 2)
    older = client.get(f"{API}/threads/c1/messages?limit=200&before={page['messages'][0]['id']}", headers=h).json()
    assert older["messages"] + page["messages"] == all_msgs and older["has_more"] is False
    word = all_msgs[0]["text"].split()[0]
    assert all(word.lower() in m["text"].lower() for m in client.get(f"{API}/threads/c1/messages?q={word}", headers=h).json()["messages"])
    assert [m["at"] for m in all_msgs] == sorted(m["at"] for m in all_msgs)  # oldest first


def test_reactions_stars_and_deleting(client, auth):
    mary, sarah = auth("mary"), auth("sarah")
    m = client.post(f"{API}/threads/c2/messages", headers=mary, json={"text": "Hello"}).json()
    r = client.put(f"{API}/threads/c2/messages/{m['id']}/reaction", headers=sarah, json={"emoji": "❤️"})
    assert r.json()["reactions"] == {"sarah": "❤️"}
    assert client.delete(f"{API}/threads/c2/messages/{m['id']}/reaction", headers=sarah).json()["reactions"] == {}
    assert client.put(f"{API}/threads/c2/messages/{m['id']}/star", headers=sarah).status_code == 204
    starred = client.get(f"{API}/threads/c2/messages?starred=true", headers=sarah).json()["messages"]
    assert [x["id"] for x in starred] == [m["id"]] and starred[0]["starred"] is True
    assert client.delete(f"{API}/threads/c2/messages/{m['id']}", headers=sarah).status_code == 403  # not hers
    gone = client.delete(f"{API}/threads/c2/messages/{m['id']}", headers=mary).json()
    assert gone["deleted"] is True and gone["text"] == ""
    assert client.put(f"{API}/threads/c2/messages/{m['id']}/reaction", headers=sarah, json={"emoji": "👍"}).status_code == 422
    assert client.post(f"{API}/threads/c2/messages/{m['id']}/restore", headers=mary).json()["text"] == "Hello"


def test_message_rules(client, auth):
    h = auth("mary")
    assert client.post(f"{API}/threads/c2/messages", headers=h, json={"text": "   "}).status_code == 422
    assert client.post(f"{API}/threads/c2/messages", headers=h, json={"text": "x" * 4001}).status_code == 422
    assert client.post(f"{API}/threads/c2/messages", headers=h, json={"text": "re", "reply_to": "nope"}).status_code == 404
    assert client.post(f"{API}/threads", headers=h, json={"to": ["mary"], "text": "me"}).status_code == 422
    assert client.post(f"{API}/threads", headers=h, json={"to": ["grace"], "text": "hi"}).status_code == 422  # no account


def test_non_members_cannot_get_in(client, auth):
    james = auth("james")  # not in c2 (Mary and Sarah)
    for method, path, body in [("get", "/threads/c2", None), ("get", "/threads/c2/messages", None),
                               ("post", "/threads/c2/messages", {"text": "hi"}), ("post", "/threads/c2/read", None),
                               ("patch", "/threads/c2", {"pinned": True}), ("delete", "/threads/c2", None)]:
        assert client.request(method, API + path, headers=james, json=body).status_code == 404, path
    assert "c2" not in threads(client, james)


def test_leaving_a_group_and_undo(client, auth):
    anna = auth("anna")
    assert client.delete(f"{API}/threads/c4", headers=anna).status_code == 204
    assert "c4" not in threads(client, anna)
    assert client.post(f"{API}/threads/c4/messages", headers=anna, json={"text": "hi"}).status_code == 404
    assert "anna" not in threads(client, auth("mary"))["c4"]["members"]
    assert client.post(f"{API}/threads/c4/restore", headers=anna).status_code == 200
    assert "c4" in threads(client, anna)


def test_clearing_and_deleting_a_private_chat(client, auth):
    mary, sarah = auth("mary"), auth("sarah")
    assert client.delete(f"{API}/threads/c2/messages", headers=mary).status_code == 204
    assert client.get(f"{API}/threads/c2/messages", headers=mary).json()["messages"] == []
    assert client.get(f"{API}/threads/c2/messages", headers=sarah).json()["messages"] != []  # only for Mary
    assert client.post(f"{API}/threads/c2/messages/restore", headers=mary).status_code == 204
    assert client.get(f"{API}/threads/c2/messages", headers=mary).json()["messages"] != []
    assert client.delete(f"{API}/threads/c2", headers=mary).status_code == 204
    assert "c2" not in threads(client, mary)
    client.post(f"{API}/threads/c2/messages", headers=sarah, json={"text": "Are you there?"})
    assert "c2" in threads(client, mary)  # comes back with the new message


def test_removed_members_cannot_be_messaged(client, auth):
    mary = auth("mary")
    assert client.delete(f"{API}/members/{member_id(client, mary, 'james')}", headers=mary).status_code == 204
    r = client.post(f"{API}/threads", headers=mary, json={"to": ["james"], "text": "hi"})
    assert r.status_code == 422


def test_read_all_and_unread_counts(client, auth):
    h = auth("mary")
    assert sum(t["unread"] for t in threads(client, h).values()) > 0
    assert client.patch(f"{API}/threads/c2", headers=h, json={"unread": True}).json()["unread"] >= 1
    assert client.post(f"{API}/threads/read-all", headers=h).status_code == 204
    assert sum(t["unread"] for t in threads(client, h).values()) == 0


def test_search_ignores_case_and_treats_wildcards_as_text(client, auth):
    """The same on SQLite and PostgreSQL (whose LIKE is case-sensitive): "hello" finds "Hello", and % or _ are just
    characters, so "%" doesn't match every message."""
    mary = auth("mary")
    hello = client.post(f"{API}/threads/c2/messages", headers=mary, json={"text": "Hello Grandad"}).json()
    pct = client.post(f"{API}/threads/c2/messages", headers=mary, json={"text": "50% off at the bakery"}).json()

    def found(q):
        return [m["id"] for m in client.get(f"{API}/threads/c2/messages", params={"q": q}, headers=mary).json()["messages"]]

    assert hello["id"] in found("hello") and hello["id"] in found("GRANDAD")
    assert found("%") == [pct["id"]]
    assert found("50_ off") == []
