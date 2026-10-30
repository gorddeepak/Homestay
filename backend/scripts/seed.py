"""Populate MongoDB with the EazyInvites sample users, listings, and reviews.

Run from the ``backend`` directory:

    python -m scripts.seed

The seeder is destructive: it drops the ``reviews``, ``listings``, ``users``,
and stale ``sessions`` collections before inserting the sample data. It reads
the same ``backend/.env`` as the FastAPI app, so ``ATLAS_DB_URL`` must include
the target database name.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pymongo import MongoClient

from app.auth import hash_password
from app.config import database_url

SAMPLE_PASSWORD = "Password123"
SAMPLE_USERS = [
    ("alice_travels", "alice@example.com"),
    ("bob_explorer", "bob@example.com"),
    ("cara_wanders", "cara@example.com"),
    ("danny_nomad", "danny@example.com"),
    ("elena_roams", "elena@example.com"),
    ("farid_journeys", "farid@example.com"),
    ("grace_wayfarer", "grace@example.com"),
    ("hiro_treks", "hiro@example.com"),
    ("isla_voyages", "isla@example.com"),
    ("jonas_drifts", "jonas@example.com"),
]

DATA_FILE = Path(__file__).with_name("seed_data.json")


def random_past_date() -> datetime:
    """Return a random UTC timestamp between six months ago and yesterday."""
    seconds = random.randint(1, 180 * 24 * 60 * 60)
    return datetime.now(timezone.utc) - timedelta(seconds=seconds)


def main() -> None:
    payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    listings = payload["listings"]
    review_pool = payload["reviewPool"]

    client = MongoClient(database_url(), serverSelectionTimeoutMS=5000)
    try:
        db = client.get_default_database()
        db.drop_collection("reviews")
        db.drop_collection("listings")
        db.drop_collection("users")
        # The legacy app stored login sessions here. The React/FastAPI app uses
        # signed auth cookies instead, so stale session documents are not useful.
        db.drop_collection("sessions")
        db.users.create_index("username", unique=True)

        user_ids = []
        for username, email in SAMPLE_USERS:
            salt, password_hash = hash_password(SAMPLE_PASSWORD)
            document = {
                "username": username,
                "email": email,
                "salt": salt,
                "hash": password_hash,
                "__v": 0,
            }
            user_ids.append(db.users.insert_one(document).inserted_id)

        review_count = 0
        for index, listing in enumerate(listings):
            listing_document = {
                key: value for key, value in listing.items() if key != "reviewIndices"
            }
            listing_document.update(
                {
                    "owner": user_ids[index % len(user_ids)],
                    "review": [],
                    "__v": 0,
                }
            )
            listing_id = db.listings.insert_one(listing_document).inserted_id

            review_ids = []
            for offset, review_index in enumerate(listing["reviewIndices"]):
                entry = review_pool[review_index]
                review = {
                    "rating": entry["rating"],
                    "comment": entry["comment"],
                    "author": user_ids[(index + offset + 1) % len(user_ids)],
                    "createdAt": random_past_date(),
                    "__v": 0,
                }
                review_ids.append(db.reviews.insert_one(review).inserted_id)
                review_count += 1

            db.listings.update_one(
                {"_id": listing_id}, {"$set": {"review": review_ids}}
            )

        print(
            f"Seeded {len(user_ids)} users, {len(listings)} listings, "
            f"and {review_count} reviews."
        )
        print(f"Demo login: alice_travels / {SAMPLE_PASSWORD}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
