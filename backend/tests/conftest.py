import os
from uuid import uuid4

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient, uri_parser

TEST_DB_NAME = f"homestay_phase1_test_{uuid4().hex}"
TEST_DB_URI = f"mongodb://127.0.0.1:27017/{TEST_DB_NAME}"

# Ignore any developer connection string so tests can only touch a disposable
# loopback database.
os.environ["ATLAS_DB_URL"] = TEST_DB_URI
os.environ["ENVIRONMENT"] = "development"
os.environ["AUTH_JWT_SECRET"] = "phase2-test-jwt-secret-" + "x" * 32
os.environ["AUTH_COOKIE_SECURE"] = "false"
os.environ["AUTH_ALLOWED_ORIGINS"] = "http://localhost:5173"
# Tests must never call the real image or map providers.
os.environ["CLOUD_NAME"] = ""
os.environ["CLOUD_API_KEY"] = ""
os.environ["CLOUD_API_SECRET"] = ""
os.environ["MAPTILER_API_KEY"] = ""
# Tests must never call the real Gemini API; AI tests patch the agent boundary.
os.environ["GEMINI_API_KEY"] = ""
os.environ["GEMINI_MODEL"] = "gemini-3.5-flash-lite"
os.environ["GEMINI_TIMEOUT_SECONDS"] = "5"

from app.auth import limiter  # noqa: E402
from app.main import app  # noqa: E402

OWNER_ID = ObjectId("64b0000000000000000000a1")
LISTING_WITH_OWNER = ObjectId("64b000000000000000000001")
LISTING_SPARSE = ObjectId("64b000000000000000000002")
MISSING_LISTING = ObjectId("64b000000000000000000099")


@pytest.fixture(scope="session")
def database():
    parsed = uri_parser.parse_uri(TEST_DB_URI)
    hosts = {host for host, _port in parsed["nodelist"]}
    if hosts - {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("Backend tests must use a loopback MongoDB host.")
    if not TEST_DB_NAME.startswith("homestay_phase1_test_"):
        raise RuntimeError("Backend tests must use a disposable test database.")

    client = MongoClient(TEST_DB_URI, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client[TEST_DB_NAME]
    db.users.create_index("username", unique=True)

    db.users.insert_one(
        {
            "_id": OWNER_ID,
            "username": "alice_travels",
            "email": "alice@example.com",
            "salt": "private-salt",
            "hash": "private-hash",
        }
    )
    db.listings.insert_many(
        [
            {
                "_id": LISTING_WITH_OWNER,
                "title": "Cliffside Cottage",
                "description": "A quiet cottage above the sea.",
                "image": {
                    "url": "https://example.com/cottage.jpg",
                    "filename": "cottage",
                },
                "price": 4500,
                "location": "Varkala",
                "country": "India",
                "geometry": {"type": "Point", "coordinates": [76.7, 8.7]},
                "category": "Coastal Haven",
                "owner": OWNER_ID,
                "review": [],
                "__v": 0,
            },
            {
                "_id": LISTING_SPARSE,
                "title": "Sparse Stay",
                "owner": None,
            },
        ]
    )

    yield db

    client.drop_database(TEST_DB_NAME)
    client.close()


@pytest.fixture(scope="session")
def ids():
    return {
        "owner": str(OWNER_ID),
        "with_owner": str(LISTING_WITH_OWNER),
        "sparse": str(LISTING_SPARSE),
        "missing": str(MISSING_LISTING),
    }


@pytest.fixture(scope="session")
def client(database):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def clean_auth_state(client):
    """Keep cookies and rate-limit counters isolated between tests."""
    client.cookies.clear()
    limiter.reset()
    yield
    client.cookies.clear()
    limiter.reset()
