"""The Overview screen's poll, prompt of the week and mood check-in."""
from helpers import API, new_family


def test_taking_back_a_vote_and_closing_a_poll(client, auth):
    anna, michael = auth("anna"), auth("michael")
    p = client.post(f"{API}/polls", headers=michael, json={"question": "Where?", "options": ["Here", "There"]}).json()
    voted = client.put(f"{API}/polls/{p['id']}/vote", headers=anna, json={"choice": 1}).json()
    assert voted["mine"] == 1 and voted["votes"] == [0, 1]
    changed = client.put(f"{API}/polls/{p['id']}/vote", headers=anna, json={"choice": 0}).json()
    assert changed["votes"] == [1, 0] and changed["total"] == 1  # voting again changes it

    unvoted = client.delete(f"{API}/polls/{p['id']}/vote", headers=anna)
    assert unvoted.status_code == 200 and unvoted.json()["mine"] is None and unvoted.json()["total"] == 0
    assert client.delete(f"{API}/polls/{p['id']}/vote", headers=anna).json()["total"] == 0  # nothing to take back

    assert client.post(f"{API}/polls/{p['id']}/close", headers=anna).status_code == 403
    closed = client.post(f"{API}/polls/{p['id']}/close", headers=michael)
    assert closed.status_code == 200
    assert client.post(f"{API}/polls/{p['id']}/close", headers=michael).status_code == 200  # closing twice is harmless
    assert client.put(f"{API}/polls/{p['id']}/vote", headers=anna, json={"choice": 0}).status_code == 422
    assert client.get(f"{API}/polls/current", headers=anna).json() is None
    assert client.put(f"{API}/polls/no-such-poll/vote", headers=anna, json={"choice": 0}).status_code == 404


def test_prompt_of_the_week(client, auth):
    anna, james, michael = auth("anna"), auth("james"), auth("michael")
    assert client.post(f"{API}/prompts", headers=james, json={"question": "Rainy Sundays?"}).status_code == 403
    p = client.post(f"{API}/prompts", headers=michael, json={"question": "  What did you do on rainy Sundays? "})
    assert p.status_code == 201, p.text
    prompt = p.json()
    assert prompt["question"] == "What did you do on rainy Sundays?" and prompt["by"] == "michael" and prompt["count"] == 0

    current = client.get(f"{API}/prompts/current", headers=anna).json()
    assert current["id"] == prompt["id"]

    assert client.post(f"{API}/prompts/{prompt['id']}/replies", headers=anna, json={"text": "   "}).status_code == 422
    reply = client.post(f"{API}/prompts/{prompt['id']}/replies", headers=anna, json={"text": " Board games "}).json()
    assert reply["text"] == "Board games" and reply["can_delete"] is True
    seen = client.get(f"{API}/prompts/current", headers=james).json()
    assert seen["count"] == 1 and seen["replies"][0]["can_delete"] is False
    assert client.get(f"{API}/prompts/current", headers=michael).json()["replies"][0]["can_delete"] is True

    assert client.delete(f"{API}/prompts/{prompt['id']}/replies/{reply['id']}", headers=anna).status_code == 204
    assert client.delete(f"{API}/prompts/{prompt['id']}/replies/{reply['id']}", headers=anna).status_code == 404  # already gone
    assert client.delete(f"{API}/prompts/{prompt['id']}/replies/no-such-reply", headers=michael).status_code == 404
    assert client.get(f"{API}/prompts/current", headers=anna).json()["count"] == 0
    assert client.post(f"{API}/prompts/no-such-prompt/replies", headers=anna, json={"text": "Hi"}).status_code == 404


def test_a_moderator_can_remove_anyones_reply(client, auth):
    reply = client.post(f"{API}/prompts/pr1/replies", headers=auth("anna"), json={"text": "Snowball fights"}).json()
    assert client.delete(f"{API}/prompts/pr1/replies/{reply['id']}", headers=auth("michael")).status_code == 204


def test_a_new_family_has_no_poll_or_prompt_yet(client):
    fiona = new_family(client)
    assert client.get(f"{API}/polls/current", headers=fiona).json() is None
    assert client.get(f"{API}/prompts/current", headers=fiona).json() is None
    ov = client.get(f"{API}/overview", headers=fiona).json()
    assert ov["poll"] is None and ov["prompt"] is None
    assert client.post(f"{API}/prompts/pr1/replies", headers=fiona, json={"text": "Hi"}).status_code == 404  # another family's


def test_mood_check_in_and_undo(client, auth):
    anna, james = auth("anna"), auth("james")
    before = client.get(f"{API}/mood", headers=anna).json()
    assert before["mine"] is None and set(before["family"]) >= {"joyful", "grateful"}

    client.put(f"{API}/mood", headers=anna, json={"mood": "joyful"})
    client.put(f"{API}/mood", headers=james, json={"mood": "joyful"})
    assert client.put(f"{API}/mood", headers=anna, json={"mood": "tired"}).json()["mine"] == "tired"  # answering again changes it
    family = client.get(f"{API}/mood", headers=james).json()["family"]
    assert family["joyful"] == before["family"]["joyful"] + 1 and family["tired"] == before["family"]["tired"] + 1

    cleared = client.delete(f"{API}/mood", headers=anna).json()
    assert cleared["mine"] is None and cleared["family"]["tired"] == before["family"]["tired"]
    assert client.delete(f"{API}/mood", headers=anna).status_code == 200  # nothing to undo
