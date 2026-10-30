from datetime import datetime, timezone
from uuid import uuid4

import pytest
from bson import ObjectId
from pymongo.errors import PyMongoError

from app import geocoding, images
from app.auth import hash_password
from app.database import get_database
from app.main import app

ORIGIN = "http://localhost:5173"
PASSWORD = "ListingPassword123!"

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"phase3-test-image"
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"phase3-test-image"


def unique(prefix):
    return f"{prefix}_{uuid4().hex[:10]}"


def create_user(database, username=None):
    username = username or unique("owner")
    salt, password_hash = hash_password(PASSWORD)
    result = database.users.insert_one(
        {
            "username": username,
            "email": f"{username}@example.com",
            "salt": salt,
            "hash": password_hash,
            "__v": 0,
        }
    )
    return {
        "_id": result.inserted_id,
        "id": str(result.inserted_id),
        "username": username,
    }


def login(client, user):
    response = client.post(
        "/api/auth/login",
        json={"username": user["username"], "password": PASSWORD},
        headers={"Origin": ORIGIN},
    )
    assert response.status_code == 200, response.text
    return response


def listing_payload(**overrides):
    payload = {
        "title": "Test Cabin",
        "description": "A quiet test cabin.",
        "price": 2500,
        "location": "Manali",
        "country": "India",
        "category": "Mountain Escape",
        "image": {"url": "/images/manali.png", "filename": "listingimage"},
        "geometry": {"type": "Point", "coordinates": [77.18, 32.24]},
    }
    payload.update(overrides)
    return payload


def post_listing(client, **overrides):
    return client.post(
        "/api/listings", json=listing_payload(**overrides), headers={"Origin": ORIGIN}
    )


@pytest.fixture
def make_user(database):
    created = []

    def _make():
        user = create_user(database)
        created.append(user["_id"])
        return user

    yield _make

    database.listings.delete_many({"owner": {"$in": created}})
    database.users.delete_many({"_id": {"$in": created}})


@pytest.fixture
def make_review(database):
    created = []

    def _make():
        result = database.reviews.insert_one(
            {
                "rating": 5,
                "comment": "A test review.",
                "createdAt": datetime.now(timezone.utc),
            }
        )
        created.append(result.inserted_id)
        return result.inserted_id

    yield _make

    if created:
        database.reviews.delete_many({"_id": {"$in": created}})


def test_create_listing_assigns_authenticated_owner(client, database, make_user):
    user = make_user()
    login(client, user)

    response = post_listing(client)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["title"] == "Test Cabin"
    assert body["owner"] == {"id": user["id"], "username": user["username"]}
    assert body["geometry"] == {"type": "Point", "coordinates": [77.18, 32.24]}
    assert "salt" not in response.text and "hash" not in response.text

    stored = database.listings.find_one({"_id": ObjectId(body["id"])})
    assert stored["owner"] == user["_id"]
    assert stored["review"] == []
    assert stored["__v"] == 0
    assert stored["image"] == {"url": "/images/manali.png", "filename": "listingimage"}


def test_create_listing_ignores_client_supplied_owner(client, database, make_user):
    user = make_user()
    other = make_user()
    login(client, user)

    response = post_listing(
        client, owner=other["id"], review=["not-a-review"], __v=99
    )

    assert response.status_code == 201, response.text
    stored = database.listings.find_one({"_id": ObjectId(response.json()["id"])})
    assert stored["owner"] == user["_id"]
    assert stored["owner"] != other["_id"]
    assert stored["review"] == []
    assert stored["__v"] == 0


def test_create_listing_validates_input(client, database, make_user):
    user = make_user()
    login(client, user)

    valid = listing_payload()
    cases = {
        "missing title": {key: value for key, value in valid.items() if key != "title"},
        "blank title": {**valid, "title": "   "},
        "invalid category": {**valid, "category": "Space Station"},
        "negative price": {**valid, "price": -1},
        "fractional price": {**valid, "price": 10.5},
        "missing image": {key: value for key, value in valid.items() if key != "image"},
        "unsafe image url": {
            **valid,
            "image": {"url": "javascript:alert(1)", "filename": "x"},
        },
    }

    for name, payload in cases.items():
        response = client.post(
            "/api/listings", json=payload, headers={"Origin": ORIGIN}
        )
        assert response.status_code == 422, f"{name}: {response.text}"

    assert database.listings.count_documents({"owner": user["_id"]}) == 0


def test_unauthenticated_listing_mutations_are_rejected(
    client, database, make_user
):
    owner = make_user()
    login(client, owner)
    listing_id = post_listing(client).json()["id"]
    client.cookies.clear()

    responses = [
        client.post("/api/listings", json=listing_payload(), headers={"Origin": ORIGIN}),
        client.patch(
            f"/api/listings/{listing_id}", json={"title": "Hijacked"}, headers={"Origin": ORIGIN}
        ),
        client.delete(f"/api/listings/{listing_id}", headers={"Origin": ORIGIN}),
        client.delete(
            f"/api/listings/{listing_id}/image", headers={"Origin": ORIGIN}
        ),
        client.post(
            "/api/uploads",
            files={"file": ("photo.png", PNG_BYTES, "image/png")},
            headers={"Origin": ORIGIN},
        ),
    ]

    assert [response.status_code for response in responses] == [401] * 5
    assert database.listings.find_one({"_id": ObjectId(listing_id)})["title"] == "Test Cabin"


def test_untrusted_origin_is_rejected_for_listing_mutations(
    client, database, make_user
):
    user = make_user()
    login(client, user)
    listing_id = post_listing(client).json()["id"]

    requests = [
        ("post", "/api/listings", {"json": listing_payload()}),
        ("patch", f"/api/listings/{listing_id}", {"json": {"title": "Changed"}}),
        ("delete", f"/api/listings/{listing_id}", {}),
        ("delete", f"/api/listings/{listing_id}/image", {}),
        (
            "post",
            "/api/uploads",
            {"files": {"file": ("photo.png", PNG_BYTES, "image/png")}},
        ),
    ]

    for origin in ("https://evil.example", None):
        for method, path, kwargs in requests:
            headers = {"Origin": origin} if origin else {}
            response = getattr(client, method)(path, headers=headers, **kwargs)
            assert response.status_code == 403, f"{origin} {method} {path}"

    stored = database.listings.find_one({"_id": ObjectId(listing_id)})
    assert stored["title"] == "Test Cabin"
    assert stored["image"]["url"] == "/images/manali.png"


def test_mine_returns_only_the_authenticated_users_listings(
    client, database, make_user
):
    first = make_user()
    second = make_user()

    login(client, first)
    first_listing = post_listing(client, title="First users listing").json()
    client.cookies.clear()

    login(client, second)
    second_listing = post_listing(client, title="Second users listing").json()

    mine = client.get("/api/listings/mine")
    assert mine.status_code == 200
    assert [listing["id"] for listing in mine.json()] == [second_listing["id"]]
    client.cookies.clear()

    login(client, first)
    mine = client.get("/api/listings/mine")
    assert mine.status_code == 200
    assert [listing["id"] for listing in mine.json()] == [first_listing["id"]]


def test_update_own_listing_preserves_other_fields_and_geometry(
    client, database, make_user
):
    user = make_user()
    login(client, user)
    created = post_listing(client).json()

    response = client.patch(
        f"/api/listings/{created['id']}",
        json={"title": "Renamed Cabin", "price": 3100},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["title"] == "Renamed Cabin"
    assert updated["price"] == 3100
    assert updated["description"] == created["description"]
    assert updated["location"] == created["location"]
    assert updated["category"] == created["category"]
    assert updated["image_url"] == created["image_url"]
    assert updated["geometry"] == created["geometry"]
    assert updated["owner"] == created["owner"]

    stored = database.listings.find_one({"_id": ObjectId(created["id"])})
    assert stored["geometry"] == {"type": "Point", "coordinates": [77.18, 32.24]}
    assert stored["owner"] == user["_id"]


def test_update_rejects_another_users_listing(client, database, make_user):
    owner = make_user()
    intruder = make_user()
    login(client, owner)
    created = post_listing(client).json()
    client.cookies.clear()

    login(client, intruder)
    response = client.patch(
        f"/api/listings/{created['id']}",
        json={"title": "Hijacked"},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Listing not found"}
    assert database.listings.find_one({"_id": ObjectId(created["id"])})["title"] == "Test Cabin"


def test_update_rejects_invalid_and_missing_ids(client, make_user):
    login(client, make_user())

    malformed = client.patch(
        "/api/listings/not-an-object-id", json={"title": "x"}, headers={"Origin": ORIGIN}
    )
    missing = client.patch(
        f"/api/listings/{ObjectId()}", json={"title": "x"}, headers={"Origin": ORIGIN}
    )

    assert malformed.status_code == 400
    assert malformed.json() == {"detail": "Invalid listing id"}
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Listing not found"}


def test_update_location_regenerates_geometry(client, database, make_user, monkeypatch):
    calls = []

    def fake_geocode(location):
        calls.append(location)
        return {"type": "Point", "coordinates": [73.85, 15.49]}

    monkeypatch.setattr(geocoding, "geocode", fake_geocode)

    login(client, make_user())
    created = post_listing(client).json()

    response = client.patch(
        f"/api/listings/{created['id']}",
        json={"location": "Goa"},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 200, response.text
    assert response.json()["geometry"] == {
        "type": "Point",
        "coordinates": [73.85, 15.49],
    }
    assert calls == ["Goa"]

    # A later unrelated edit keeps the regenerated geometry.
    again = client.patch(
        f"/api/listings/{created['id']}",
        json={"price": 5000},
        headers={"Origin": ORIGIN},
    )
    assert again.json()["geometry"] == {
        "type": "Point",
        "coordinates": [73.85, 15.49],
    }
    assert calls == ["Goa"]


def test_update_location_failure_leaves_listing_unchanged(
    client, database, make_user, monkeypatch
):
    login(client, make_user())
    created = post_listing(client).json()
    before = database.listings.find_one({"_id": ObjectId(created["id"])})

    def unavailable(_location):
        raise geocoding.GeocodingUnavailable("no key")

    monkeypatch.setattr(geocoding, "geocode", unavailable)
    unavailable_response = client.patch(
        f"/api/listings/{created['id']}",
        json={"location": "Nowhere"},
        headers={"Origin": ORIGIN},
    )

    def not_found(_location):
        raise geocoding.LocationNotFound("no feature")

    monkeypatch.setattr(geocoding, "geocode", not_found)
    not_found_response = client.patch(
        f"/api/listings/{created['id']}",
        json={"location": "Nowhere"},
        headers={"Origin": ORIGIN},
    )

    assert unavailable_response.status_code == 503
    assert not_found_response.status_code == 422
    after = database.listings.find_one({"_id": ObjectId(created["id"])})
    assert after["location"] == before["location"]
    assert after["geometry"] == before["geometry"]


def test_invalid_geometry_is_rejected(client, database, make_user):
    login(client, make_user())

    invalid_geometries = [
        {"type": "LineString", "coordinates": [77.18, 32.24]},
        {"type": "Point", "coordinates": [77.18, 32.24, 10]},
        {"type": "Point", "coordinates": [200, 32.24]},
        {"type": "Point", "coordinates": [77.18, 100]},
        {"type": "Point", "coordinates": ["east", 32.24]},
    ]

    for geometry in invalid_geometries:
        response = post_listing(client, geometry=geometry)
        assert response.status_code == 422, f"{geometry}: {response.text}"


def test_public_detail_exposes_only_public_location_data(client, database, make_user):
    user = make_user()
    login(client, user)
    created = post_listing(client).json()

    detail = client.get(f"/api/listings/{created['id']}")
    cards = client.get("/api/listings")

    assert detail.status_code == 200
    assert cards.status_code == 200
    assert detail.json()["geometry"] == {
        "type": "Point",
        "coordinates": [77.18, 32.24],
    }
    card = next(item for item in cards.json() if item["id"] == created["id"])
    assert "geometry" not in card
    assert "description" not in card
    assert "@example.com" not in detail.text
    assert PASSWORD not in detail.text
    assert "salt" not in detail.text
    assert "hash" not in detail.text


def test_public_detail_handles_malformed_stored_geometry(client, database, make_user):
    user = make_user()
    login(client, user)
    created = post_listing(client).json()
    database.listings.update_one(
        {"_id": ObjectId(created["id"])},
        {"$set": {"geometry": {"type": "LineString", "coordinates": [1, 2]}}},
    )

    response = client.get(f"/api/listings/{created['id']}")

    assert response.status_code == 200
    assert response.json()["geometry"] is None


def test_delete_own_listing_removes_listing_and_reviews(
    client, database, make_user, make_review
):
    user = make_user()
    login(client, user)
    created = post_listing(client).json()
    review_id = make_review()
    database.listings.update_one(
        {"_id": ObjectId(created["id"])}, {"$set": {"review": [review_id]}}
    )

    response = client.delete(
        f"/api/listings/{created['id']}", headers={"Origin": ORIGIN}
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert database.listings.find_one({"_id": ObjectId(created["id"])}) is None
    assert database.reviews.find_one({"_id": review_id}) is None


def test_delete_rejects_another_users_listing(client, database, make_user):
    owner = make_user()
    intruder = make_user()
    login(client, owner)
    created = post_listing(client).json()
    client.cookies.clear()

    login(client, intruder)
    response = client.delete(
        f"/api/listings/{created['id']}", headers={"Origin": ORIGIN}
    )

    assert response.status_code == 404
    assert database.listings.find_one({"_id": ObjectId(created["id"])}) is not None


def test_delete_rejects_invalid_and_missing_ids(client, make_user):
    login(client, make_user())

    malformed = client.delete(
        "/api/listings/not-an-object-id", headers={"Origin": ORIGIN}
    )
    missing = client.delete(f"/api/listings/{ObjectId()}", headers={"Origin": ORIGIN})

    assert malformed.status_code == 400
    assert missing.status_code == 404


def test_upload_requires_auth_origin_and_configuration(client, make_user):
    user = make_user()

    anonymous = client.post(
        "/api/uploads",
        files={"file": ("photo.png", PNG_BYTES, "image/png")},
        headers={"Origin": ORIGIN},
    )

    login(client, user)
    bad_origin = client.post(
        "/api/uploads",
        files={"file": ("photo.png", PNG_BYTES, "image/png")},
        headers={"Origin": "https://evil.example"},
    )
    unconfigured = client.post(
        "/api/uploads",
        files={"file": ("photo.png", PNG_BYTES, "image/png")},
        headers={"Origin": ORIGIN},
    )

    assert anonymous.status_code == 401
    assert bad_origin.status_code == 403
    assert unconfigured.status_code == 502
    assert unconfigured.json() == {"detail": "Image upload failed"}


def test_upload_validates_content_and_size(client, make_user, monkeypatch):
    login(client, make_user())
    uploaded = []

    def fake_upload(content):
        uploaded.append(content)
        return {
            "url": "https://res.cloudinary.com/demo/image/upload/photo.png",
            "filename": "airbnb_DEV/photo",
        }

    monkeypatch.setattr(images, "upload_image", fake_upload)

    valid = client.post(
        "/api/uploads",
        files={"file": ("photo.png", PNG_BYTES, "image/png")},
        headers={"Origin": ORIGIN},
    )
    disguised = client.post(
        "/api/uploads",
        files={"file": ("photo.png", b"not an image", "image/png")},
        headers={"Origin": ORIGIN},
    )

    assert valid.status_code == 200
    assert valid.json() == {
        "url": "https://res.cloudinary.com/demo/image/upload/photo.png",
        "filename": "airbnb_DEV/photo",
    }
    assert uploaded == [PNG_BYTES]
    assert disguised.status_code == 422

    monkeypatch.setattr(images, "MAX_IMAGE_BYTES", len(PNG_BYTES) - 1)
    oversized = client.post(
        "/api/uploads",
        files={"file": ("photo.png", PNG_BYTES, "image/png")},
        headers={"Origin": ORIGIN},
    )
    assert oversized.status_code == 413


def test_upload_provider_failure_is_reported(client, make_user, monkeypatch):
    login(client, make_user())

    def failing_upload(_content):
        raise images.ImageStorageError("provider down")

    monkeypatch.setattr(images, "upload_image", failing_upload)
    response = client.post(
        "/api/uploads",
        files={"file": ("photo.png", PNG_BYTES, "image/png")},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "Image upload failed"}


def test_replacing_image_deletes_the_old_asset_after_update(
    client, database, make_user, monkeypatch
):
    deleted = []
    monkeypatch.setattr(images, "delete_image", deleted.append)

    login(client, make_user())
    old_image = {
        "url": "https://res.cloudinary.com/demo/image/upload/old.jpg",
        "filename": "airbnb_DEV/old",
    }
    new_image = {
        "url": "https://res.cloudinary.com/demo/image/upload/new.jpg",
        "filename": "airbnb_DEV/new",
    }
    created = post_listing(client, image=old_image).json()

    response = client.patch(
        f"/api/listings/{created['id']}",
        json={"image": new_image},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 200, response.text
    assert response.json()["image_url"] == new_image["url"]
    assert deleted == ["airbnb_DEV/old"]
    stored = database.listings.find_one({"_id": ObjectId(created["id"])})
    assert stored["image"] == new_image
    assert set(stored["image"]) == {"url", "filename"}


def test_local_images_are_never_sent_to_the_provider(
    client, database, make_user, monkeypatch
):
    deleted = []
    monkeypatch.setattr(images, "delete_image", deleted.append)

    login(client, make_user())
    created = post_listing(client).json()

    replaced = client.patch(
        f"/api/listings/{created['id']}",
        json={"image": {"url": "/images/dubai.png", "filename": "listingimage"}},
        headers={"Origin": ORIGIN},
    )
    deleted_listing = client.delete(
        f"/api/listings/{created['id']}", headers={"Origin": ORIGIN}
    )

    assert replaced.status_code == 200
    assert deleted_listing.status_code == 200
    assert deleted == []


def test_image_removal_requires_ownership(client, database, make_user, monkeypatch):
    deleted = []
    monkeypatch.setattr(images, "delete_image", deleted.append)

    owner = make_user()
    intruder = make_user()
    login(client, owner)
    image = {
        "url": "https://res.cloudinary.com/demo/image/upload/owned.jpg",
        "filename": "airbnb_DEV/owned",
    }
    created = post_listing(client, image=image).json()
    client.cookies.clear()

    login(client, intruder)
    forbidden = client.delete(
        f"/api/listings/{created['id']}/image", headers={"Origin": ORIGIN}
    )

    assert forbidden.status_code == 404
    assert deleted == []
    stored = database.listings.find_one({"_id": ObjectId(created["id"])})
    assert stored["image"] == image
    client.cookies.clear()

    # The endpoint accepts no asset identifier from the client, so only the
    # image stored on the authorized listing can ever be deleted.
    login(client, owner)
    removed = client.delete(
        f"/api/listings/{created['id']}/image", headers={"Origin": ORIGIN}
    )

    assert removed.status_code == 200
    # Only the asset stored on the authorized listing is deleted.
    assert deleted == ["airbnb_DEV/owned"]
    assert "image" not in database.listings.find_one({"_id": ObjectId(created["id"])})


def test_shared_asset_is_not_deleted_while_still_referenced(
    client, database, make_user, monkeypatch
):
    deleted = []
    monkeypatch.setattr(images, "delete_image", deleted.append)

    user = make_user()
    login(client, user)
    image = {
        "url": "https://res.cloudinary.com/demo/image/upload/shared.jpg",
        "filename": "airbnb_DEV/shared",
    }
    first = post_listing(client, title="First", image=image).json()
    second = post_listing(client, title="Second", image=image).json()

    response = client.delete(
        f"/api/listings/{first['id']}/image", headers={"Origin": ORIGIN}
    )

    assert response.status_code == 200
    assert deleted == []
    assert database.listings.find_one({"_id": ObjectId(second["id"])})["image"] == image


def test_create_without_geometry_geocodes_the_location(
    client, database, make_user, monkeypatch
):
    calls = []

    def fake_geocode(location):
        calls.append(location)
        return {"type": "Point", "coordinates": [77.0, 32.0]}

    monkeypatch.setattr(geocoding, "geocode", fake_geocode)
    login(client, make_user())

    response = post_listing(client, geometry=None)

    assert response.status_code == 201, response.text
    assert calls == ["Manali"]
    stored = database.listings.find_one({"_id": ObjectId(response.json()["id"])})
    assert stored["geometry"] == {"type": "Point", "coordinates": [77.0, 32.0]}


def test_create_cleans_up_the_image_when_the_insert_fails(
    client, database, make_user, monkeypatch
):
    deleted = []
    monkeypatch.setattr(images, "delete_image", deleted.append)

    class FailingCollection:
        def __init__(self, collection):
            self._collection = collection

        def insert_one(self, *_args, **_kwargs):
            raise PyMongoError("insert failed")

        def __getattr__(self, name):
            return getattr(self._collection, name)

    class FailingListingsDatabase:
        def __init__(self, db):
            self.listings = FailingCollection(db.listings)

        def __getattr__(self, name):
            return getattr(database, name)

    app.dependency_overrides[get_database] = lambda: FailingListingsDatabase(database)
    try:
        login(client, make_user())
        response = post_listing(
            client,
            image={
                "url": "https://res.cloudinary.com/demo/image/upload/new.jpg",
                "filename": "airbnb_DEV/new",
            },
        )
    finally:
        app.dependency_overrides.pop(get_database, None)

    assert response.status_code == 503
    assert deleted == ["airbnb_DEV/new"]
    assert database.listings.count_documents({"image.filename": "airbnb_DEV/new"}) == 0


def test_config_exposes_only_the_public_map_key(client):
    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json() == {"maptiler_key": None}
