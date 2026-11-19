"""Gatherings (create, change, cancel, restore, RSVP) and the calendar worked out from the tree and the timeline."""
from helpers import API


def lunch(client, headers, **extra):
    r = client.post(f"{API}/events", headers=headers, json={"title": "Lunch", "date": "2027-01-10", "place": "Gran's", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_event_needs_a_title(client, auth):
    r = client.post(f"{API}/events", headers=auth("james"), json={"title": "   ", "date": "2027-01-10"})
    assert r.status_code == 422
    assert client.get(f"{API}/events/no-such-event", headers=auth("james")).status_code == 404


def test_only_the_organiser_or_a_moderator_changes_a_gathering(client, auth):
    james, emma, michael = auth("james"), auth("emma"), auth("michael")
    e = lunch(client, james)
    assert e["sub"] == "Gran's" and e["can_edit"] is True

    assert client.patch(f"{API}/events/{e['id']}", headers=emma, json={"time": "14:00"}).status_code == 403
    r = client.patch(f"{API}/events/{e['id']}", headers=james, json={"title": "  Sunday lunch ", "time": "14:00", "extra_guests": 3})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Sunday lunch" and r.json()["sub"] == "Gran's • 14:00" and r.json()["attending"] == 4
    assert client.patch(f"{API}/events/{e['id']}", headers=james, json={"time": "2pm"}).status_code == 422
    # Clearing the time is allowed ("" means no time).
    assert client.patch(f"{API}/events/{e['id']}", headers=michael, json={"time": ""}).json()["time"] is None
    assert client.get(f"{API}/events/{e['id']}", headers=emma).json()["can_edit"] is False


def test_cancelled_gathering_can_be_restored_by_its_organiser(client, auth):
    james, emma = auth("james"), auth("emma")
    e = lunch(client, james)
    assert client.delete(f"{API}/events/{e['id']}", headers=james).status_code == 204
    assert e["id"] not in {x["id"] for x in client.get(f"{API}/events", headers=emma).json()}
    cancelled = client.get(f"{API}/events?include_cancelled=true", headers=emma).json()
    assert next(x for x in cancelled if x["id"] == e["id"])["cancelled"] is True

    assert client.post(f"{API}/events/{e['id']}/restore", headers=emma).status_code == 403
    r = client.post(f"{API}/events/{e['id']}/restore", headers=james)
    assert r.status_code == 200 and r.json()["cancelled"] is False
    assert e["id"] in {x["id"] for x in client.get(f"{API}/events", headers=emma).json()}


def test_events_list_by_date_range(client, auth):
    james = auth("james")
    jan, mar = lunch(client, james), lunch(client, james, date="2027-03-05")
    listed = [x["id"] for x in client.get(f"{API}/events?from=2027-01-01&to=2027-01-31", headers=james).json()]
    assert jan["id"] in listed and mar["id"] not in listed
    assert mar["id"] in [x["id"] for x in client.get(f"{API}/events?from=2027-02-01", headers=james).json()]
    assert jan["id"] in [x["id"] for x in client.get(f"{API}/events?to=2027-02-01", headers=james).json()]


def test_taking_back_an_rsvp(client, auth):
    james, anna = auth("james"), auth("anna")
    e = lunch(client, james)
    assert client.put(f"{API}/events/{e['id']}/rsvp", headers=anna).json()["attending"] == 2  # no body means yes
    r = client.delete(f"{API}/events/{e['id']}/rsvp", headers=anna)
    assert r.status_code == 200 and r.json()["attending"] == 1 and r.json()["rsvp"] is None
    # Taking it back again is harmless.
    assert client.delete(f"{API}/events/{e['id']}/rsvp", headers=anna).json()["attending"] == 1
    assert [a["person_id"] for a in client.get(f"{API}/events/{e['id']}/attendees", headers=anna).json()] == ["james"]
    # "no" counts as an answer but not as attending.
    no = client.put(f"{API}/events/{e['id']}/rsvp", headers=anna, json={"answer": "no"}).json()
    assert no["rsvp"] == "no" and no["attending"] == 1 and no["going"] is False


def test_calendar_range_must_be_valid_dates(client, auth):
    james = auth("james")
    assert client.get(f"{API}/calendar?from=soon", headers=james).status_code == 422
    assert client.get(f"{API}/calendar?from=2027-01-01&to=2027-13-01", headers=james).status_code == 422
    default = client.get(f"{API}/calendar", headers=james)  # today + 30 days
    assert default.status_code == 200


def test_leap_day_birthday_falls_on_28_february(client, auth):
    james = auth("james")
    p = client.post(f"{API}/people", headers=james, json={"first": "Leap", "last": "Day", "born": "2000-02-29", "relation": "child",
                                                         "relative_id": "james"})
    assert p.status_code == 201, p.text
    pid = p.json()["id"]

    def birthday(year):
        cal = client.get(f"{API}/calendar?from={year}-02-01&to={year}-03-31&kinds=birthday", headers=james).json()
        return next(i for i in cal if i["person_id"] == pid)

    assert birthday(2027)["date"] == "2027-02-28"
    assert birthday(2028)["date"] == "2028-02-29"
    year_only = client.post(f"{API}/people", headers=james, json={"first": "Some", "last": "Year", "born": "1990", "relation": "child",
                                                                 "relative_id": "james"}).json()
    whole_year = client.get(f"{API}/calendar?from=2027-01-01&to=2027-12-31&kinds=birthday", headers=james).json()
    assert all(i["kind"] == "birthday" for i in whole_year)
    assert year_only["id"] not in {i["person_id"] for i in whole_year}  # no exact day to celebrate


def test_calendar_respects_birthday_privacy(client, auth):
    james = auth("james")
    url = f"{API}/calendar?from=2027-02-01&to=2027-02-28&kinds=birthday"  # Mary was born on 19 February
    assert "mary" in {i["person_id"] for i in client.get(url, headers=james).json()}
    assert client.patch(f"{API}/privacy/categories", headers=auth("mary"), json={"birthdays": "Only Me (draft)"}).status_code == 200
    assert "mary" not in {i["person_id"] for i in client.get(url, headers=james).json()}
    assert "mary" in {i["person_id"] for i in client.get(url, headers=auth("mary")).json()}  # she still sees her own


def test_anniversaries_skip_dates_that_dont_exist(client, auth):
    michael = auth("michael")
    ok = client.post(f"{API}/milestones", headers=michael, json={"type": "Weddings", "title": "Our wedding", "date": "2020-06-01"})
    bad = client.post(f"{API}/milestones", headers=michael, json={"type": "Weddings", "title": "Odd date", "date": "2020-02-30"})
    assert ok.status_code == 201 and bad.status_code == 201  # the timeline accepts YYYY-MM-DD by shape
    cal = client.get(f"{API}/calendar?from=2027-01-01&to=2027-12-31&kinds=anniversary", headers=michael).json()
    by_milestone = {i["milestone_id"]: i for i in cal}
    assert by_milestone[ok.json()["id"]]["years"] == 7 and by_milestone[ok.json()["id"]]["date"] == "2027-06-01"
    assert bad.json()["id"] not in by_milestone
