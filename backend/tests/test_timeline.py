"""Additional tests for Timeline filtering, permissions, verification and restoration."""

from helpers import API, upload


def create_milestone(client, headers, **overrides):
    data = {
        "type": "Milestones",
        "title": "Family celebration",
        "date": "2025-06-15",
        "text": "A special family occasion",
        "place": "Kigali",
        "people": ["james"],
    }
    data.update(overrides)
    response = client.post(f"{API}/milestones", headers=headers, json=data)
    assert response.status_code == 201, response.text
    return response.json()


def test_timeline_filters_by_type_and_search(client, auth):
    james = auth("james")
    wedding = create_milestone(
        client, james, type="Weddings", title="James wedding",
        text="TimelineProbe987", place="TimelinePlace987",
    )
    create_milestone(
        client, james, type="Births", title="Family birth",
        date="2024", text="A new family member", place="Huye",
    )

    weddings = client.get(f"{API}/milestones?type=Weddings", headers=james)
    assert weddings.status_code == 200
    assert wedding["id"] in [m["id"] for m in weddings.json()]
    assert all(m["type"] == "Weddings" for m in weddings.json())

    searched = client.get(f"{API}/milestones?q=TIMELINEPROBE987", headers=james)
    assert wedding["id"] in [m["id"] for m in searched.json()]

    by_place = client.get(f"{API}/milestones?q=TIMELINEPLACE987", headers=james)
    assert len(by_place.json()) == 1
    assert by_place.json()[0]["id"] == wedding["id"]

    no_match = client.get(f"{API}/milestones?q=not-found", headers=james)
    assert no_match.json() == []


def test_timeline_validation_and_read_permissions(client, auth):
    james = auth("james")

    assert client.post(
        f"{API}/milestones", headers=james,
        json={"title": " ", "date": "2025"},
    ).status_code == 422

    assert client.post(
        f"{API}/milestones", headers=james,
        json={"title": "Bad date", "date": "not-a-date"},
    ).status_code == 422

    milestone = create_milestone(client, james)
    assert milestone["can_edit"] is True

    other = client.get(
        f"{API}/milestones/{milestone['id']}", headers=auth("anna")
    )
    assert other.status_code == 200
    assert other.json()["can_edit"] is False

    assert client.get(
        f"{API}/milestones/does-not-exist", headers=james
    ).status_code == 404


def test_timeline_update_permissions_and_fields(client, auth):
    james = auth("james")
    milestone = create_milestone(client, james)

    assert client.patch(
        f"{API}/milestones/{milestone['id']}",
        headers=auth("emma"), json={"title": "Unauthorized change"},
    ).status_code == 403

    updated = client.patch(
        f"{API}/milestones/{milestone['id']}",
        headers=james,
        json={
            "title": "  Updated family celebration  ",
            "type": "Weddings",
            "date": "2025-07-01",
            "place": "Huye",
            "text": "Updated description",
            "people": ["james"],
            "source": "Family records",
        },
    )

    assert updated.status_code == 200, updated.text
    data = updated.json()
    assert data["title"] == "Updated family celebration"
    assert data["type"] == "Weddings"
    assert data["icon"] == "favorite"
    assert data["date"] == "2025-07-01"
    assert data["place"] == "Huye"
    assert data["text"] == "Updated description"
    assert data["people"] == ["james"]
    assert data["source"] == "Family records"
    assert data["verified"] is False


def test_approximate_milestone_verification_and_reopening(client, auth):
    james, michael = auth("james"), auth("michael")
    milestone = create_milestone(
        client, james, title="Approximate family event", approx=True
    )

    response = client.post(
        f"{API}/milestones/{milestone['id']}/verify", headers=michael
    )
    assert response.status_code == 422

    updated = client.patch(
        f"{API}/milestones/{milestone['id']}",
        headers=james,
        json={"approx": False, "date": "2025-06-15"},
    )
    assert updated.status_code == 200
    assert updated.json()["verified"] is False

    verified = client.post(
        f"{API}/milestones/{milestone['id']}/verify", headers=michael
    )
    assert verified.status_code == 200
    assert verified.json()["verified"] is True

    reopened = client.post(
        f"{API}/milestones/{milestone['id']}/reopen", headers=michael
    )
    assert reopened.status_code == 200
    assert reopened.json()["verified"] is False


def test_timeline_delete_and_restore_permissions(client, auth):
    james, michael, anna = auth("james"), auth("michael"), auth("anna")
    milestone = create_milestone(client, james)
    mid = milestone["id"]

    assert client.delete(
        f"{API}/milestones/{mid}", headers=auth("emma")
    ).status_code == 403

    deleted = client.delete(f"{API}/milestones/{mid}", headers=michael)
    assert deleted.status_code == 204

    assert client.get(
        f"{API}/milestones/{mid}", headers=james
    ).status_code == 404

    listed = client.get(f"{API}/milestones", headers=james)
    assert mid not in [m["id"] for m in listed.json()]

    assert client.post(
        f"{API}/milestones/{mid}/restore", headers=anna
    ).status_code == 403

    restored = client.post(
        f"{API}/milestones/{mid}/restore", headers=michael
    )
    assert restored.status_code == 200
    assert restored.json()["id"] == mid

    assert client.get(
        f"{API}/milestones/{mid}", headers=james
    ).status_code == 200


def test_timeline_photo_creation_and_replacement(client, auth):
    james = auth("james")

    first_photo = upload(client, james)
    assert first_photo.status_code == 201

    milestone = create_milestone(
        client, james,
        title="Family photo milestone",
        upload_id=first_photo.json()["id"],
    )

    assert milestone["hasPhoto"] is True
    assert milestone["upload_id"] == first_photo.json()["id"]
    assert milestone["p1"]
    assert milestone["p2"]

    second_photo = upload(client, james)
    assert second_photo.status_code == 201

    updated = client.patch(
        f"{API}/milestones/{milestone['id']}",
        headers=james,
        json={"upload_id": second_photo.json()["id"]},
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["upload_id"] == second_photo.json()["id"]
    assert updated.json()["hasPhoto"] is True


def test_invalid_milestone_type_is_rejected(client, auth):
    response = client.post(
        f"{API}/milestones",
        headers=auth("james"),
        json={
            "type": "InvalidType",
            "title": "Invalid milestone",
            "date": "2025",
        },
    )
    assert response.status_code == 422


def test_timeline_filters_by_year_range(client, auth):
    james = auth("james")

    first = create_milestone(
        client, james, title="YearRangeStartUnique", date="2024-12-31"
    )
    middle = create_milestone(
        client, james, title="YearRangeMiddleUnique", date="2025-06-15"
    )
    create_milestone(
        client, james, title="YearRangeEndUnique", date="2026-01-01"
    )

    response = client.get(
        f"{API}/milestones?from_year=2025&to_year=2025&q=YearRange",
        headers=james,
    )

    assert response.status_code == 200
    ids = [m["id"] for m in response.json()]
    assert middle["id"] in ids
    assert first["id"] not in ids


def test_timeline_person_filter_excludes_untagged_milestones(client, auth):
    james = auth("james")

    tagged = create_milestone(
        client, james, title="TaggedPersonUnique", people=["james"]
    )
    untagged = create_milestone(
        client, james, title="UntaggedPersonUnique", people=[]
    )

    response = client.get(
        f"{API}/milestones?person=james&q=PersonUnique",
        headers=james,
    )

    assert response.status_code == 200
    ids = [m["id"] for m in response.json()]
    assert tagged["id"] in ids
    assert untagged["id"] not in ids
