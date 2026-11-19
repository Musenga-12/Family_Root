"""Tests for legacy family records: visibility, filtering, editing and lifecycle."""
from helpers import API, PDF, WEBM, local, new_family, upload


def test_record_visibility_respects_privacy_even_for_admins(client, auth):
    mary = auth("mary")
    james = auth("james")
    anna = auth("anna")

    # Only Me: even an Admin other than the author cannot see it.
    assert client.get(f"{API}/records/r4", headers=mary).status_code == 200
    assert client.get(f"{API}/records/r4", headers=james).status_code == 404

    # Immediate Family: Mary's son can see it, but a non-immediate relative cannot.
    assert client.get(f"{API}/records/r5", headers=james).status_code == 200
    assert client.get(f"{API}/records/r5", headers=anna).status_code == 404


def test_record_list_filters_and_search(client, auth):
    headers = auth("james")

    certificates = client.get(
        f"{API}/records",
        headers=headers,
        params={"category": "Certificates"},
    )
    assert certificates.status_code == 200
    assert certificates.json()
    assert all(r["category"] == "Certificates" for r in certificates.json())

    review = client.get(
        f"{API}/records",
        headers=headers,
        params={"status": "review"},
    )
    assert review.status_code == 200
    assert all(r["status"] == "review" for r in review.json())

    search = client.get(
        f"{API}/records",
        headers=headers,
        params={"q": "Royal Highland"},
    )
    assert search.status_code == 200
    assert any(r["id"] == "r3" for r in search.json())

    invalid_sort = client.get(
        f"{API}/records",
        headers=headers,
        params={"sort": "unknown"},
    )
    assert invalid_sort.status_code == 422

    # A family with no records yet gets an empty list, not someone else's.
    assert client.get(f"{API}/records", headers=new_family(client)).json() == []


def test_record_creation_validation_and_permissions(client, auth):
    james = auth("james")
    anna = auth("anna")

    created = client.post(
        f"{API}/records",
        headers=james,
        json={
            "title": "New family letter",
            "category": "Letters",
            "date": "2026-11",
            "text": "A message for the family",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "review"
    assert created.json()["custodian"] == "james"

    denied = client.post(
        f"{API}/records",
        headers=anna,
        json={"title": "Viewer record", "date": "2026", "text": "Not allowed"},
    )
    assert denied.status_code == 403

    invalid_category = client.post(
        f"{API}/records",
        headers=james,
        json={
            "title": "Invalid category",
            "category": "Unknown",
            "date": "2026",
            "text": "Text",
        },
    )
    assert invalid_category.status_code == 422

    invalid_date = client.post(
        f"{API}/records",
        headers=james,
        json={"title": "Invalid date", "date": "not-a-date", "text": "Text"},
    )
    assert invalid_date.status_code == 422

    blank_title = client.post(
        f"{API}/records",
        headers=james,
        json={"title": "  ", "date": "2026", "text": "Text"},
    )
    assert blank_title.status_code == 422


def test_record_edit_verify_and_reopen(client, auth):
    sarah = auth("sarah")
    michael = auth("michael")
    mary = auth("mary")

    # Sarah owns r1, so her edit is allowed and resets verification.
    edited = client.patch(
        f"{API}/records/r1",
        headers=sarah,
        json={"text": "Updated certificate details"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "review"

    # A different moderator can verify it.
    verified = client.post(f"{API}/records/r1/verify", headers=michael)
    assert verified.status_code == 200, verified.text
    assert verified.json()["status"] == "verified"

    # An Admin moderator can reopen it for review.
    reopened = client.post(f"{API}/records/r1/reopen", headers=mary)
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["status"] == "review"


def test_record_delete_and_restore(client, auth):
    mary = auth("mary")

    deleted = client.delete(f"{API}/records/r2", headers=mary)
    assert deleted.status_code == 204

    # A soft-deleted record is hidden from normal reads and lists.
    assert client.get(f"{API}/records/r2", headers=mary).status_code == 404
    listed = client.get(f"{API}/records", headers=mary)
    assert listed.status_code == 200
    assert all(r["id"] != "r2" for r in listed.json())

    restored = client.post(f"{API}/records/r2/restore", headers=mary)
    assert restored.status_code == 200, restored.text
    assert restored.json()["id"] == "r2"


# r6 (the 1921 census extract) is held by Sarah, and the seed makes a record's custodian its author:
# Sarah can attach files to it, while James (a Contributor who didn't add it) cannot.

def test_record_attachments_accept_images_and_pdfs(client, auth):
    sarah, michael = auth("sarah"), auth("michael")

    image = upload(client, sarah)
    assert image.status_code == 201, image.text

    attached = client.post(f"{API}/records/r6/attachments", headers=sarah, json={"upload_id": image.json()["id"]})
    assert attached.status_code == 201, attached.text
    files = attached.json()["attachments"]
    assert [(f["id"], f["content_type"]) for f in files] == [(image.json()["id"], "image/png")]
    assert client.get(local(files[0]["url"])).status_code == 200  # the signed link opens the file

    # A new file changes what was checked, so a verified record goes back to awaiting review...
    assert client.post(f"{API}/records/r6/verify", headers=michael).json()["status"] == "verified"
    pdf = upload(client, sarah, data=PDF, ctype="application/pdf", name="scan.pdf")
    assert pdf.status_code == 201, pdf.text
    attached_pdf = client.post(f"{API}/records/r6/attachments", headers=sarah, json={"upload_id": pdf.json()["id"]})
    assert attached_pdf.status_code == 201, attached_pdf.text
    assert attached_pdf.json()["status"] == "review"
    assert [f["content_type"] for f in attached_pdf.json()["attachments"]] == ["image/png", "application/pdf"]

    # ...but attaching a file that is already there changes nothing: no duplicate, and the check stands.
    assert client.post(f"{API}/records/r6/verify", headers=michael).json()["status"] == "verified"
    duplicate = client.post(f"{API}/records/r6/attachments", headers=sarah, json={"upload_id": image.json()["id"]})
    assert duplicate.status_code == 201
    assert len(duplicate.json()["attachments"]) == 2
    assert duplicate.json()["status"] == "verified"

    # Other readers see the attachments too.
    assert len(client.get(f"{API}/records/r6", headers=auth("james")).json()["attachments"]) == 2


def test_record_attachment_rejects_invalid_and_foreign_uploads(client, auth):
    sarah, james, michael = auth("sarah"), auth("james"), auth("michael")

    # Audio is a valid upload, but not a valid record attachment.
    audio = upload(client, sarah, data=WEBM, ctype="audio/webm", name="audio.webm")
    assert audio.status_code == 201, audio.text
    invalid_type = client.post(f"{API}/records/r6/attachments", headers=sarah, json={"upload_id": audio.json()["id"]})
    assert invalid_type.status_code == 422
    assert "image or a PDF" in invalid_type.json()["detail"]

    # Nobody can attach a file someone else uploaded, even an Admin.
    michaels_file = upload(client, michael)
    assert michaels_file.status_code == 201
    not_owner = client.post(f"{API}/records/r6/attachments", headers=sarah, json={"upload_id": michaels_file.json()["id"]})
    assert not_owner.status_code == 422
    assert "you uploaded" in not_owner.json()["detail"]

    missing = client.post(f"{API}/records/r6/attachments", headers=sarah, json={"upload_id": "no-such-upload"})
    assert missing.status_code == 404

    # A Contributor can't add files to a record someone else added, even with their own upload.
    james_file = upload(client, james)
    assert james_file.status_code == 201
    forbidden = client.post(f"{API}/records/r6/attachments", headers=james, json={"upload_id": james_file.json()["id"]})
    assert forbidden.status_code == 403

    assert client.get(f"{API}/records/r6", headers=sarah).json()["attachments"] == []


def test_record_attachment_removal(client, auth):
    sarah, james = auth("sarah"), auth("james")
    upload_id = upload(client, sarah).json()["id"]
    attached = client.post(f"{API}/records/r6/attachments", headers=sarah, json={"upload_id": upload_id})
    assert attached.status_code == 201, attached.text

    assert client.delete(f"{API}/records/r6/attachments/{upload_id}", headers=james).status_code == 403
    assert len(client.get(f"{API}/records/r6", headers=sarah).json()["attachments"]) == 1

    removed = client.delete(f"{API}/records/r6/attachments/{upload_id}", headers=sarah)
    assert removed.status_code == 200, removed.text
    assert removed.json()["attachments"] == []

    missing = client.delete(f"{API}/records/r6/attachments/{upload_id}", headers=sarah)
    assert missing.status_code == 404

    # The file itself is kept, so it can be attached again.
    again = client.post(f"{API}/records/r6/attachments", headers=sarah, json={"upload_id": upload_id})
    assert again.status_code == 201 and len(again.json()["attachments"]) == 1


def test_record_update_validation(client, auth):
    sarah = auth("sarah")

    def patch(body):
        return client.patch(f"{API}/records/r6", headers=sarah, json=body)

    assert patch({"visibility": "Everyone"}).status_code == 422
    assert patch({"category": "Postcards"}).status_code == 422
    assert patch({"date": "1921/06/19"}).status_code == 422
    assert patch({"sealedUntil": "next year"}).status_code == 422
    assert patch({"sealedUntil": "2001-01-01"}).status_code == 422  # must be in the future
    assert patch({"text": "   "}).status_code == 422
    assert patch({"text": None}).status_code == 422
    assert patch({"custodian": "nobody"}).status_code == 422

    # Changing the category changes the icon; clearing the custodian or an unset seal is allowed.
    letter = patch({"category": "Letters"})
    assert letter.status_code == 200, letter.text
    assert letter.json()["icon"] == client.get(f"{API}/records/r5", headers=sarah).json()["icon"]  # r5 is a letter

    cleared = patch({"custodian": None, "sealedUntil": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["custodian"] is None
    assert cleared.json()["sealed"] is False and cleared.json()["category"] == "Letters"

    shared = patch({"visibility": "Immediate Family"})
    assert shared.status_code == 200 and shared.json()["visibility"] == "Immediate Family"
    assert client.get(f"{API}/records/r6", headers=auth("emma")).status_code == 404  # Emma married into the family

    moved = patch({"custodian": "michael"})
    assert moved.status_code == 200 and moved.json()["custodian"] == "michael"


def test_sealing_a_record_and_who_may_verify(client, auth):
    sarah, michael, mary = auth("sarah"), auth("michael"), auth("mary")

    # Whoever added a record can't verify it themselves, even as an Admin.
    own = client.post(f"{API}/records/r6/verify", headers=sarah)
    assert own.status_code == 403
    assert "Someone other than" in own.json()["detail"]
    assert client.get(f"{API}/records/r6", headers=michael).json()["can_verify"] is True

    # Sealing it turns it into a time capsule only its author can read or change.
    sealed = client.patch(f"{API}/records/r6", headers=sarah, json={"sealedUntil": "2099-01-01"})
    assert sealed.status_code == 200, sealed.text
    assert sealed.json()["category"] == "Time capsules" and sealed.json()["sealed"] is True
    assert sealed.json()["text"] != ""

    as_michael = client.get(f"{API}/records/r6", headers=michael).json()
    assert as_michael["text"] == "" and as_michael["can_edit"] is False and as_michael["can_verify"] is False
    assert client.post(f"{API}/records/r6/verify", headers=michael).status_code == 422  # can't check what nobody can read
    assert client.patch(f"{API}/records/r6", headers=mary, json={"title": "Peek"}).status_code == 403
    assert client.get(f"{API}/records?sealed=true", headers=michael).json()[0]["sealed"] is True
    assert "r6" not in {r["id"] for r in client.get(f"{API}/records?sealed=false", headers=michael).json()}


def test_only_the_author_or_a_moderator_removes_and_restores(client, auth):
    sarah, james = auth("sarah"), auth("james")

    assert client.delete(f"{API}/records/r6", headers=james).status_code == 403
    assert client.delete(f"{API}/records/r6", headers=sarah).status_code == 204
    assert client.post(f"{API}/records/r6/restore", headers=james).status_code == 403
    assert client.get(f"{API}/records/r6", headers=james).status_code == 404  # still removed

    # A Contributor may remove and restore a record they added themselves.
    mine = client.post(f"{API}/records", headers=james, json={"title": "Draft letter", "date": "2026", "text": "Hello"}).json()
    assert client.delete(f"{API}/records/{mine['id']}", headers=james).status_code == 204
    assert client.post(f"{API}/records/{mine['id']}/restore", headers=james).status_code == 200
    assert client.post(f"{API}/records/no-such-record/restore", headers=james).status_code == 404
