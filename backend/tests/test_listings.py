from pymongo.errors import PyMongoError

from app.database import get_database
from app.main import app


class BrokenListings:
    def find(self, *_args, **_kwargs):
        raise PyMongoError("list failed")

    def find_one(self, *_args, **_kwargs):
        raise PyMongoError("find failed")


class BrokenDatabase:
    listings = BrokenListings()


def test_list_listings_returns_public_cards(client, ids):
    response = client.get("/api/listings")

    assert response.status_code == 200
    listings = response.json()
    assert len(listings) == 2

    by_id = {listing["id"]: listing for listing in listings}
    assert by_id[ids["with_owner"]] == {
        "id": ids["with_owner"],
        "title": "Cliffside Cottage",
        "price": 4500,
        "location": "Varkala",
        "country": "India",
        "category": "Coastal Haven",
        "image_url": "https://example.com/cottage.jpg",
    }
    assert "description" not in by_id[ids["with_owner"]]
    assert "owner" not in by_id[ids["with_owner"]]


def test_list_listings_handles_missing_and_optional_fields(client, ids):
    response = client.get("/api/listings")

    assert response.status_code == 200
    sparse = next(
        listing for listing in response.json() if listing["id"] == ids["sparse"]
    )
    assert sparse == {
        "id": ids["sparse"],
        "title": "Sparse Stay",
        "price": None,
        "location": None,
        "country": None,
        "category": None,
        "image_url": None,
    }


def test_list_listings_does_not_expose_private_user_fields(client, ids):
    response = client.get("/api/listings")

    assert response.status_code == 200
    assert "alice@example.com" not in response.text
    assert "private-salt" not in response.text
    assert "private-hash" not in response.text


def test_get_listing_returns_detail_with_public_owner(client, ids):
    response = client.get(f"/api/listings/{ids['with_owner']}")

    assert response.status_code == 200
    detail = response.json()
    assert detail["id"] == ids["with_owner"]
    assert detail["description"] == "A quiet cottage above the sea."
    assert detail["price"] == 4500
    assert detail["owner"] == {"id": ids["owner"], "username": "alice_travels"}
    assert set(detail["owner"]) == {"id", "username"}


def test_get_listing_handles_missing_optional_fields_and_owner(client, ids):
    response = client.get(f"/api/listings/{ids['sparse']}")

    assert response.status_code == 200
    detail = response.json()
    assert detail["id"] == ids["sparse"]
    assert detail["description"] is None
    assert detail["price"] is None
    assert detail["image_url"] is None
    assert detail["owner"] is None


def test_get_listing_rejects_malformed_id(client):
    response = client.get("/api/listings/not-an-object-id")

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid listing id"}


def test_get_listing_returns_404_for_missing_listing(client, ids):
    response = client.get(f"/api/listings/{ids['missing']}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Listing not found"}


def test_list_listings_returns_503_when_database_fails(client):
    app.dependency_overrides[get_database] = lambda: BrokenDatabase()
    try:
        response = client.get("/api/listings")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}


def test_get_listing_returns_503_when_database_fails(client, ids):
    app.dependency_overrides[get_database] = lambda: BrokenDatabase()
    try:
        response = client.get(f"/api/listings/{ids['with_owner']}")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}


def test_health_reports_database_connection(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
