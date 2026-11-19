"""Tests for notification creation, listing, access control and read status."""

from datetime import timedelta

from sqlmodel import Session, select

from app.db import engine
from app.models import Notification, User, now
from app.routers.notifications import family_users, notify
from app.realtime import hub
from helpers import API


def add_notifications(user_email, count=3):
    """Create predictable notifications for a seeded account."""
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == user_email)).one()
        created = now()
        rows = [
            Notification(
                family_id=user.family_id,
                user_id=user.id,
                kind=f"test.{i}",
                title=f"Test notification {i}",
                body=f"Body {i}",
                link=f"/test/{i}",
                created_at=created + timedelta(seconds=i),
                read_at=created if i == 1 else None,
            )
            for i in range(count)
        ]
        db.add_all(rows)
        db.commit()
        return [row.id for row in rows]


def test_notify_skips_empty_recipients():
    with Session(engine) as db:
        notify(
            db,
            family_id=1,
            user_ids=[None, 0],
            kind="test.empty",
            title="Nobody to notify",
        )


def test_notify_deduplicates_recipients_and_excludes_actor(monkeypatch):
    delivered = []
    monkeypatch.setattr(hub, "notify", lambda user_ids, event: delivered.append((user_ids, event)))

    with Session(engine) as db:
        mary = db.exec(select(User).where(User.email == "mary@example.com")).one()
        james = db.exec(select(User).where(User.email == "james@example.com")).one()

        notify(
            db,
            family_id=mary.family_id,
            user_ids=[mary.id, james.id, james.id, None, 0],
            kind="test.created",
            title="A test event",
            body="Testing notification creation",
            link="/test",
            exclude=mary.id,
        )

        saved = db.exec(
            select(Notification).where(
                Notification.family_id == mary.family_id,
                Notification.kind == "test.created",
            )
        ).all()

        assert len(saved) == 1
        assert saved[0].user_id == james.id
        assert saved[0].title == "A test event"
        assert saved[0].body == "Testing notification creation"
        assert saved[0].link == "/test"

    assert len(delivered) == 1
    assert delivered[0][0] == [james.id]
    assert delivered[0][1]["type"] == "notification.new"


def test_family_users_returns_active_users_and_filters_roles():
    with Session(engine) as db:
        mary = db.exec(select(User).where(User.email == "mary@example.com")).one()

        all_users = family_users(db, mary.family_id)
        admins = family_users(db, mary.family_id, ("Admin",))
        viewers = family_users(db, mary.family_id, ("Viewer",))

        assert mary.id in all_users
        assert admins
        assert viewers
        assert all(
            db.get(User, user_id).role == "Admin"
            for user_id in admins
        )
        assert all(
            db.get(User, user_id).role == "Viewer"
            for user_id in viewers
        )

        assert family_users(db, -999) == []


def test_notification_list_unread_filter_and_limit(client, auth):
    add_notifications("mary@example.com")

    headers = auth("mary")

    response = client.get(f"{API}/notifications", headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert len(data["items"]) == 3
    assert data["unread"] == 2
    assert data["items"][0]["title"] == "Test notification 2"
    assert data["items"][0]["read"] is False

    unread = client.get(
        f"{API}/notifications?unread_only=true",
        headers=headers,
    )
    assert unread.status_code == 200
    assert len(unread.json()["items"]) == 2
    assert all(not item["read"] for item in unread.json()["items"])
    assert unread.json()["unread"] == 2

    limited = client.get(
        f"{API}/notifications?limit=1",
        headers=headers,
    )
    assert len(limited.json()["items"]) == 1
    assert limited.json()["unread"] == 2


def test_mark_read_and_mark_unread(client, auth):
    ids = add_notifications("mary@example.com")
    headers = auth("mary")

    # First notification starts unread.
    response = client.post(
        f"{API}/notifications/{ids[0]}/read",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["read"] is True

    # Reading it again keeps it read.
    again = client.post(
        f"{API}/notifications/{ids[0]}/read",
        headers=headers,
    )
    assert again.status_code == 200
    assert again.json()["read"] is True

    # Mark it unread again.
    unread = client.post(
        f"{API}/notifications/{ids[0]}/unread",
        headers=headers,
    )
    assert unread.status_code == 200
    assert unread.json()["read"] is False


def test_notifications_cannot_be_accessed_by_another_user(client, auth):
    notification_id = add_notifications("mary@example.com", count=1)[0]

    james = auth("james")

    assert client.post(
        f"{API}/notifications/{notification_id}/read",
        headers=james,
    ).status_code == 404

    assert client.post(
        f"{API}/notifications/{notification_id}/unread",
        headers=james,
    ).status_code == 404

    assert client.post(
        f"{API}/notifications/does-not-exist/read",
        headers=auth("mary"),
    ).status_code == 404


def test_mark_all_read(client, auth):
    add_notifications("mary@example.com")
    headers = auth("mary")

    response = client.post(
        f"{API}/notifications/read-all",
        headers=headers,
    )
    assert response.status_code == 204

    notifications = client.get(
        f"{API}/notifications",
        headers=headers,
    ).json()

    assert notifications["unread"] == 0
    assert all(item["read"] for item in notifications["items"])

    # Calling it again when everything is already read is also valid.
    again = client.post(
        f"{API}/notifications/read-all",
        headers=headers,
    )
    assert again.status_code == 204
