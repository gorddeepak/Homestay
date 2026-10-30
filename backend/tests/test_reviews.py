from datetime import datetime, timezone
from uuid import uuid4

import pytest
from bson import ObjectId

from app.auth import hash_password

ORIGIN = "http://localhost:5173"
PASSWORD = "ReviewPassword123!"


def unique(prefix):
    return f"{prefix}_{uuid4().hex[:10]}"


def create_user(database, username=None):
    username = username or unique("reviewer")
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


def create_listing(database, owner_id=None, title="Review Test Stay"):
    result = database.listings.insert_one(
        {
            "title": title,
            "description": "A listing used by review tests.",
            "image": {"url": "/images/review-test.png", "filename": "review-test"},
            "price": 2000,
            "location": "Pune",
            "country": "India",
            "geometry": {"type": "Point", "coordinates": [73.85, 18.52]},
            "category": "Urban Oasis",
            "owner": owner_id,
            "review": [],
            "__v": 0,
        }
    )
    return str(result.inserted_id)


@pytest.fixture
def make_user(database):
    created = []

    def _make():
        user = create_user(database)
        created.append(user)
        return user

    yield _make

    if created:
        ids = [user["_id"] for user in created]
        database.reviews.delete_many({"author": {"$in": ids}})
        database.users.delete_many({"_id": {"$in": ids}})


@pytest.fixture
def make_listing(database):
    created = []

    def _make(owner_id=None, **overrides):
        listing_id = create_listing(
            database, owner_id=owner_id, **overrides
        )
        created.append(ObjectId(listing_id))
        return listing_id

    yield _make

    if created:
        review_ids = [
            review_id
            for listing in database.listings.find({"_id": {"$in": created}})
            for review_id in listing.get("review") or []
            if isinstance(review_id, ObjectId)
        ]
        database.listings.delete_many({"_id": {"$in": created}})
        if review_ids:
            database.reviews.delete_many({"_id": {"$in": review_ids}})


def add_review(database, listing_id, author, rating=5, comment="A stored review."):
    review = {
        "rating": rating,
        "comment": comment,
        "createdAt": datetime(2026, 5, 1, 12, 30, tzinfo=timezone.utc),
        "author": author,
        "__v": 0,
    }
    result = database.reviews.insert_one(review)
    database.listings.update_one(
        {"_id": ObjectId(listing_id)}, {"$push": {"review": result.inserted_id}}
    )
    return str(result.inserted_id)


def post_review(client, listing_id, **overrides):
    payload = {"rating": 4, "comment": "Lovely stay."}
    payload.update(overrides)
    return client.post(
        f"/api/listings/{listing_id}/reviews",
        json=payload,
        headers={"Origin": ORIGIN},
    )


# --- Public reads -----------------------------------------------------------


def test_public_review_list_returns_public_fields_in_listing_order(
    client, database, make_user, make_listing
):
    author = make_user()
    other = make_user()
    listing_id = make_listing(owner_id=author["_id"])
    first = add_review(database, listing_id, author["_id"], rating=5, comment="First")
    second = add_review(database, listing_id, other["_id"], rating=3, comment="Second")

    response = client.get(f"/api/listings/{listing_id}/reviews")

    assert response.status_code == 200, response.text
    reviews = response.json()
    assert [review["id"] for review in reviews] == [first, second]
    assert reviews[0] == {
        "id": first,
        "rating": 5,
        "comment": "First",
        "author": {"id": author["id"], "username": author["username"]},
        "created_at": "2026-05-01T12:30:00Z",
    }
    assert set(reviews[0]["author"]) == {"id", "username"}
    assert "salt" not in response.text and "hash" not in response.text
    assert "@example.com" not in response.text


def test_public_review_list_handles_empty_missing_and_invalid_listings(
    client, make_listing, ids
):
    listing_id = make_listing()

    empty = client.get(f"/api/listings/{listing_id}/reviews")
    missing = client.get(f"/api/listings/{ids['missing']}/reviews")
    malformed = client.get("/api/listings/not-an-object-id/reviews")

    assert empty.status_code == 200
    assert empty.json() == []
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Listing not found"}
    assert malformed.status_code == 400
    assert malformed.json() == {"detail": "Invalid listing id"}


def test_public_review_list_skips_dangling_refs_and_handles_malformed_reviews(
    client, database, make_user, make_listing
):
    author = make_user()
    listing_id = make_listing(owner_id=author["_id"])
    dangling_id = ObjectId()
    malformed_id = database.reviews.insert_one(
        {"comment": "No rating here.", "author": author["_id"]}
    ).inserted_id
    database.listings.update_one(
        {"_id": ObjectId(listing_id)},
        {"$set": {"review": [dangling_id, malformed_id]}},
    )

    response = client.get(f"/api/listings/{listing_id}/reviews")

    assert response.status_code == 200, response.text
    reviews = response.json()
    assert len(reviews) == 1
    assert reviews[0]["id"] == str(malformed_id)
    # A missing rating is reported as null, never as one star.
    assert reviews[0]["rating"] is None
    assert reviews[0]["comment"] == "No rating here."
    assert reviews[0]["created_at"] is None


def test_public_review_list_handles_malformed_author(
    client, database, make_listing
):
    listing_id = make_listing()
    missing_author_review = database.reviews.insert_one(
        {"rating": 4, "comment": "Author was removed.", "author": ObjectId()}
    ).inserted_id
    database.listings.update_one(
        {"_id": ObjectId(listing_id)},
        {"$set": {"review": [missing_author_review]}},
    )

    response = client.get(f"/api/listings/{listing_id}/reviews")

    assert response.status_code == 200
    assert response.json()[0]["author"] is None


# --- Creation ---------------------------------------------------------------


def test_create_review_assigns_author_from_the_session(
    client, database, make_user, make_listing
):
    author = make_user()
    other = make_user()
    listing_id = make_listing(owner_id=author["_id"])
    login(client, author)

    response = post_review(
        client,
        listing_id,
        author=other["id"],
        createdAt="1999-01-01T00:00:00Z",
        __v=99,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["rating"] == 4
    assert body["comment"] == "Lovely stay."
    assert body["author"] == {"id": author["id"], "username": author["username"]}
    assert body["created_at"].startswith("20")
    assert "salt" not in response.text and "hash" not in response.text

    stored = database.reviews.find_one({"_id": ObjectId(body["id"])})
    assert stored["author"] == author["_id"]
    assert stored["rating"] == 4
    assert stored["comment"] == "Lovely stay."
    assert isinstance(stored["createdAt"], datetime)
    listing = database.listings.find_one({"_id": ObjectId(listing_id)})
    assert listing["review"] == [ObjectId(body["id"])]


def test_create_review_accepts_rating_boundaries(
    client, database, make_user, make_listing
):
    user = make_user()
    listing_id = make_listing()
    login(client, user)

    lowest = post_review(client, listing_id, rating=1, comment="Not for me.")
    highest = post_review(client, listing_id, rating=5, comment="Perfect.")

    assert lowest.status_code == 201, lowest.text
    assert highest.status_code == 201, highest.text
    assert lowest.json()["rating"] == 1
    assert highest.json()["rating"] == 5


@pytest.mark.parametrize(
    "payload",
    [
        {"comment": "No rating."},
        {"rating": None, "comment": "Null rating."},
        {"rating": 0, "comment": "Too low."},
        {"rating": 6, "comment": "Too high."},
        {"rating": 4.5, "comment": "Fractional."},
        {"rating": "five", "comment": "Not a number."},
        {"rating": True, "comment": "Boolean."},
    ],
)
def test_create_review_rejects_missing_and_invalid_ratings(
    client, database, make_user, make_listing, payload
):
    user = make_user()
    listing_id = make_listing()
    login(client, user)

    response = client.post(
        f"/api/listings/{listing_id}/reviews",
        json=payload,
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 422, response.text
    assert database.reviews.count_documents({"author": user["_id"]}) == 0
    listing = database.listings.find_one({"_id": ObjectId(listing_id)})
    assert listing["review"] == []


@pytest.mark.parametrize(
    "comment",
    [
        None,
        "",
        "   ",
        "x" * 2001,
    ],
)
def test_create_review_rejects_invalid_comments(
    client, database, make_user, make_listing, comment
):
    user = make_user()
    listing_id = make_listing()
    login(client, user)

    response = client.post(
        f"/api/listings/{listing_id}/reviews",
        json={"rating": 4, "comment": comment},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 422, response.text
    assert database.reviews.count_documents({"author": user["_id"]}) == 0


def test_create_review_trims_the_comment(client, database, make_user, make_listing):
    user = make_user()
    listing_id = make_listing()
    login(client, user)

    response = post_review(client, listing_id, comment="  Spacious and calm.  ")

    assert response.status_code == 201, response.text
    assert response.json()["comment"] == "Spacious and calm."


def test_create_review_requires_authentication_before_validation(
    client, database, make_listing
):
    listing_id = make_listing()

    invalid_body = client.post(
        f"/api/listings/{listing_id}/reviews",
        json={"rating": 9},
        headers={"Origin": ORIGIN},
    )
    valid_body = post_review(client, listing_id)

    assert invalid_body.status_code == 401
    assert valid_body.status_code == 401
    listing = database.listings.find_one({"_id": ObjectId(listing_id)})
    assert listing["review"] == []


def test_create_review_rejects_missing_and_invalid_listings(
    client, make_user, ids
):
    login(client, make_user())

    missing = post_review(client, ids["missing"])
    malformed = post_review(client, "not-an-object-id")

    assert missing.status_code == 404
    assert missing.json() == {"detail": "Listing not found"}
    assert malformed.status_code == 400
    assert malformed.json() == {"detail": "Invalid listing id"}


@pytest.mark.parametrize("origin", [None, "https://evil.example"])
def test_create_review_rejects_untrusted_origin(
    client, database, make_user, make_listing, origin
):
    user = make_user()
    listing_id = make_listing()
    login(client, user)
    headers = {"Origin": origin} if origin else {}

    response = client.post(
        f"/api/listings/{listing_id}/reviews",
        json={"rating": 4, "comment": "Blocked."},
        headers=headers,
    )

    assert response.status_code == 403
    assert database.reviews.count_documents({"author": user["_id"]}) == 0


# --- Editing ----------------------------------------------------------------


def test_update_own_review(client, database, make_user, make_listing):
    user = make_user()
    listing_id = make_listing()
    login(client, user)
    review_id = post_review(client, listing_id).json()["id"]

    response = client.patch(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        json={"rating": 2, "comment": "The host fixed the issue."},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 200, response.text
    assert response.json()["rating"] == 2
    assert response.json()["comment"] == "The host fixed the issue."
    stored = database.reviews.find_one({"_id": ObjectId(review_id)})
    assert stored["rating"] == 2
    assert stored["comment"] == "The host fixed the issue."


def test_update_review_accepts_a_single_field(client, database, make_user, make_listing):
    user = make_user()
    listing_id = make_listing()
    login(client, user)
    review_id = post_review(client, listing_id, rating=4).json()["id"]

    response = client.patch(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        json={"comment": "Updated comment only."},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 200, response.text
    assert response.json()["rating"] == 4
    assert response.json()["comment"] == "Updated comment only."


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"rating": 0},
        {"rating": 6},
        {"rating": 4.5},
        {"rating": True},
        {"comment": ""},
        {"comment": "   "},
    ],
)
def test_update_review_validates_input(
    client, database, make_user, make_listing, payload
):
    user = make_user()
    listing_id = make_listing()
    login(client, user)
    review_id = post_review(client, listing_id, rating=4, comment="Original").json()["id"]

    response = client.patch(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        json=payload,
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 422, response.text
    stored = database.reviews.find_one({"_id": ObjectId(review_id)})
    assert stored["rating"] == 4
    assert stored["comment"] == "Original"


def test_update_review_rejects_another_users_review(
    client, database, make_user, make_listing
):
    author = make_user()
    intruder = make_user()
    listing_id = make_listing()
    login(client, author)
    review_id = post_review(client, listing_id).json()["id"]
    client.cookies.clear()

    login(client, intruder)
    response = client.patch(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        json={"rating": 1},
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Review not found"}
    stored = database.reviews.find_one({"_id": ObjectId(review_id)})
    assert stored["rating"] == 4


def test_update_review_requires_the_review_to_belong_to_the_listing(
    client, database, make_user, make_listing
):
    user = make_user()
    listing_id = make_listing()
    other_listing_id = make_listing(title="Other stay")
    login(client, user)
    review_id = post_review(client, listing_id).json()["id"]

    wrong_listing = client.patch(
        f"/api/listings/{other_listing_id}/reviews/{review_id}",
        json={"rating": 1},
        headers={"Origin": ORIGIN},
    )
    missing = client.patch(
        f"/api/listings/{listing_id}/reviews/{ObjectId()}",
        json={"rating": 1},
        headers={"Origin": ORIGIN},
    )
    malformed = client.patch(
        f"/api/listings/{listing_id}/reviews/not-an-object-id",
        json={"rating": 1},
        headers={"Origin": ORIGIN},
    )

    assert wrong_listing.status_code == 404
    assert missing.status_code == 404
    assert malformed.status_code == 404
    assert database.reviews.find_one({"_id": ObjectId(review_id)})["rating"] == 4


# --- Deletion ---------------------------------------------------------------


def test_delete_own_review_removes_the_document_and_reference(
    client, database, make_user, make_listing
):
    user = make_user()
    listing_id = make_listing()
    login(client, user)
    review_id = post_review(client, listing_id).json()["id"]

    response = client.delete(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert database.reviews.find_one({"_id": ObjectId(review_id)}) is None
    listing = database.listings.find_one({"_id": ObjectId(listing_id)})
    assert listing["review"] == []


def test_cross_listing_review_deletion_is_rejected(
    client, database, make_user, make_listing
):
    """Regression: the Express route deleted any review id from any listing."""
    user = make_user()
    listing_id = make_listing()
    other_listing_id = make_listing(title="Other stay")
    login(client, user)
    review_id = post_review(client, listing_id).json()["id"]

    response = client.delete(
        f"/api/listings/{other_listing_id}/reviews/{review_id}",
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Review not found"}
    assert database.reviews.find_one({"_id": ObjectId(review_id)}) is not None
    listing = database.listings.find_one({"_id": ObjectId(listing_id)})
    assert ObjectId(review_id) in listing["review"]


def test_delete_review_rejects_another_users_review(
    client, database, make_user, make_listing
):
    author = make_user()
    intruder = make_user()
    listing_id = make_listing()
    login(client, author)
    review_id = post_review(client, listing_id).json()["id"]
    client.cookies.clear()

    login(client, intruder)
    response = client.delete(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 404
    assert database.reviews.find_one({"_id": ObjectId(review_id)}) is not None
    listing = database.listings.find_one({"_id": ObjectId(listing_id)})
    assert ObjectId(review_id) in listing["review"]


def test_review_mutations_require_authentication(
    client, database, make_user, make_listing
):
    author = make_user()
    listing_id = make_listing()
    login(client, author)
    review_id = post_review(client, listing_id).json()["id"]
    client.cookies.clear()

    update = client.patch(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        json={"rating": 1},
        headers={"Origin": ORIGIN},
    )
    delete = client.delete(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        headers={"Origin": ORIGIN},
    )

    assert update.status_code == 401
    assert delete.status_code == 401
    assert database.reviews.find_one({"_id": ObjectId(review_id)})["rating"] == 4


@pytest.mark.parametrize("origin", [None, "https://evil.example"])
def test_review_mutations_reject_untrusted_origin(
    client, database, make_user, make_listing, origin
):
    user = make_user()
    listing_id = make_listing()
    login(client, user)
    review_id = post_review(client, listing_id).json()["id"]
    headers = {"Origin": origin} if origin else {}

    update = client.patch(
        f"/api/listings/{listing_id}/reviews/{review_id}",
        json={"rating": 1},
        headers=headers,
    )
    delete = client.delete(
        f"/api/listings/{listing_id}/reviews/{review_id}", headers=headers
    )

    assert update.status_code == 403
    assert delete.status_code == 403
    stored = database.reviews.find_one({"_id": ObjectId(review_id)})
    assert stored["rating"] == 4
