import json
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import jwt
import pytest
from bson import ObjectId

from app.auth import (
    AUTH_COOKIE_NAME,
    hash_password,
    verify_password,
)
from app.config import auth_jwt_secret

ALLOWED_ORIGIN = "http://localhost:5173"
REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATE_FIXTURE = REPO_ROOT / "test" / "helpers" / "generate-password-fixture.js"
PASSPORT_LOGIN_CHECK = REPO_ROOT / "test" / "helpers" / "passport-login-check.js"


def unique(prefix):
    return f"{prefix}_{uuid4().hex[:12]}"


def signup_request(
    client,
    username=None,
    email=None,
    password="Password123!",
    origin=ALLOWED_ORIGIN,
):
    username = username or unique("signup")
    email = email or f"{username}@example.com"
    headers = {"Origin": origin} if origin is not None else {}
    response = client.post(
        "/api/auth/signup",
        json={"username": username, "email": email, "password": password},
        headers=headers,
    )
    return response


def login_request(client, username, password, origin=ALLOWED_ORIGIN):
    headers = {"Origin": origin} if origin is not None else {}
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        headers=headers,
    )


def run_node(script, *args):
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for the cross-language checks")
    return subprocess.run(
        [node, str(script), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=REPO_ROOT,
        timeout=60,
        check=False,
    )


def database_uri(database):
    host, port = database.client.address
    return f"mongodb://{host}:{port}/{database.name}"


def decode_token(token):
    return jwt.decode(token, auth_jwt_secret(), algorithms=["HS256"])


def me_with_token(client, token):
    client.cookies.set(AUTH_COOKIE_NAME, token, domain="testserver", path="/")
    return client.get("/api/auth/me")


def test_python_verifies_hash_generated_by_installed_node_plugin():
    result = run_node(GENERATE_FIXTURE, "NodeCompatible123!é🔐")

    assert result.returncode == 0, result.stderr
    fixture = json.loads(result.stdout)
    assert len(fixture["salt"]) == 64
    assert len(fixture["hash"]) == 1024

    assert verify_password(fixture["password"], fixture["salt"], fixture["hash"])
    assert not verify_password("not-the-password", fixture["salt"], fixture["hash"])

    # Reusing the plugin's salt must produce the exact same hash.
    salt, password_hash = hash_password(fixture["password"], fixture["salt"])
    assert salt == fixture["salt"]
    assert password_hash == fixture["hash"]


def test_fastapi_user_authenticates_through_passport_local(client, database):
    username = unique("passport")
    password = "PassportCompatible123!é"
    response = signup_request(client, username=username, password=password)
    assert response.status_code == 201

    uri = database_uri(database)
    accepted = run_node(PASSPORT_LOGIN_CHECK, uri, username, password)
    assert accepted.returncode == 0, accepted.stderr
    assert json.loads(accepted.stdout) == {"ok": True}

    rejected = run_node(PASSPORT_LOGIN_CHECK, uri, username, "wrong-password")
    assert rejected.returncode == 0, rejected.stderr
    assert json.loads(rejected.stdout)["ok"] is False


def test_signup_creates_user_and_authenticated_session(client, database):
    username = unique("signup")
    email = f"{username}@example.com"
    response = signup_request(client, username=username, email=email)

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "username", "email"}
    assert body["username"] == username
    assert body["email"] == email
    assert "salt" not in response.text
    assert "hash" not in response.text

    cookie_header = response.headers["set-cookie"]
    assert f"{AUTH_COOKIE_NAME}=" in cookie_header
    assert "HttpOnly" in cookie_header
    assert "Path=/" in cookie_header
    assert "SameSite=lax" in cookie_header
    assert "Max-Age=604800" in cookie_header
    assert "secure" not in cookie_header.lower()

    token = response.cookies.get(AUTH_COOKIE_NAME)
    assert decode_token(token)["sub"] == body["id"]

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == body

    stored = database.users.find_one({"username": username})
    assert stored["email"] == email
    assert len(stored["salt"]) == 64
    assert len(stored["hash"]) == 1024
    assert stored["hash"] != "Password123!"
    assert verify_password("Password123!", stored["salt"], stored["hash"])


def test_login_authenticates_an_existing_plugin_format_user(client, database):
    username = unique("existing")
    password = "ExistingPassword123!"
    salt, password_hash = hash_password(password)
    database.users.insert_one(
        {
            "username": username,
            "email": f"{username}@example.com",
            "salt": salt,
            "hash": password_hash,
            "__v": 0,
        }
    )

    response = login_request(client, username, password)

    assert response.status_code == 200
    assert response.json()["username"] == username
    assert client.get("/api/auth/me").status_code == 200


def test_login_rejects_invalid_and_unknown_credentials(client):
    username = unique("invalid")
    assert signup_request(client, username=username).status_code == 201
    client.cookies.clear()

    wrong_password = login_request(client, username, "wrong-password")
    unknown_user = login_request(client, unique("missing"), "wrong-password")

    assert wrong_password.status_code == 401
    assert unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()
    assert wrong_password.json() == {"detail": "Invalid username or password"}
    assert client.get("/api/auth/me").status_code == 401


def test_login_does_not_change_stored_password_fields(client, database):
    username = unique("unchanged")
    password = "UnchangedPassword123!"
    assert signup_request(client, username=username, password=password).status_code == 201
    before = database.users.find_one({"username": username})
    client.cookies.clear()

    assert login_request(client, username, password).status_code == 200

    after = database.users.find_one({"username": username})
    assert after["salt"] == before["salt"]
    assert after["hash"] == before["hash"]


def test_signup_rejects_duplicate_username(client):
    username = unique("duplicate")
    assert signup_request(client, username=username).status_code == 201
    second = signup_request(client, username=username)

    assert second.status_code == 409
    assert second.json() == {"detail": "Username is already taken"}


def test_signup_follows_existing_non_unique_email_rule(client):
    email = f"{unique('shared')}@example.com"

    first = signup_request(client, username=unique("first"), email=email)
    second = signup_request(client, username=unique("second"), email=email)

    assert first.status_code == 201
    assert second.status_code == 201


def test_signup_validates_input(client):
    valid = {
        "username": unique("valid"),
        "email": "valid@example.com",
        "password": "Password123!",
    }

    missing_fields = client.post("/api/auth/signup", json={}, headers={"Origin": ALLOWED_ORIGIN})
    invalid_email = client.post(
        "/api/auth/signup",
        json={**valid, "email": "not-an-email"},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    short_password = client.post(
        "/api/auth/signup",
        json={**valid, "password": "tiny"},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    blank_username = client.post(
        "/api/auth/signup",
        json={**valid, "username": "   "},
        headers={"Origin": ALLOWED_ORIGIN},
    )

    assert missing_fields.status_code == 422
    assert invalid_email.status_code == 422
    assert short_password.status_code == 422
    assert blank_username.status_code == 422
    assert "tiny" not in short_password.text
    assert all("input" not in error for error in short_password.json()["detail"])


def test_login_accepts_long_existing_credentials(client, database):
    username = "u" * 60
    password = "p" * 200
    salt, password_hash = hash_password(password)
    database.users.insert_one(
        {
            "username": username,
            "email": "long@example.com",
            "salt": salt,
            "hash": password_hash,
            "__v": 0,
        }
    )

    response = login_request(client, username, password)

    assert response.status_code == 200
    assert response.json()["username"] == username


def test_logout_clears_cookie_and_authentication(client):
    assert signup_request(client).status_code == 201
    assert client.get("/api/auth/me").status_code == 200

    response = client.post("/api/auth/logout", headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    cookie_header = response.headers["set-cookie"]
    assert f'{AUTH_COOKIE_NAME}=""' in cookie_header
    assert "Max-Age=0" in cookie_header
    assert client.get("/api/auth/me").status_code == 401


def test_me_requires_authentication(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}


def test_me_rejects_tampered_expired_and_missing_user_tokens(client):
    signup = signup_request(client)
    assert signup.status_code == 201
    token = signup.cookies.get(AUTH_COOKIE_NAME)
    user_id = signup.json()["id"]
    client.cookies.clear()

    tampered = me_with_token(client, f"{token}changed")
    expired_token = jwt.encode(
        {
            "sub": user_id,
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        auth_jwt_secret(),
        algorithm="HS256",
    )
    expired = me_with_token(client, expired_token)
    no_expiry_token = jwt.encode(
        {"sub": user_id}, auth_jwt_secret(), algorithm="HS256"
    )
    no_expiry = me_with_token(client, no_expiry_token)
    missing_user_token = jwt.encode(
        {
            "sub": str(ObjectId()),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        auth_jwt_secret(),
        algorithm="HS256",
    )
    missing_user = me_with_token(client, missing_user_token)

    assert tampered.status_code == 401
    assert expired.status_code == 401
    assert no_expiry.status_code == 401
    assert missing_user.status_code == 401


def test_me_ignores_client_supplied_identity(client, database):
    own_username = unique("own")
    other_username = unique("other")
    assert signup_request(client, username=own_username).status_code == 201
    other = database.users.insert_one(
        {"username": other_username, "email": "other@example.com"}
    )

    response = client.get(
        f"/api/auth/me?user_id={other.inserted_id}&username={other_username}",
        headers={"X-User-Id": str(other.inserted_id)},
    )

    assert response.status_code == 200
    assert response.json()["username"] == own_username


def test_state_changing_endpoints_require_a_trusted_origin(client):
    username = unique("origin")
    signup_payload = {
        "username": username,
        "email": f"{username}@example.com",
        "password": "Password123!",
    }

    for path, payload in (
        ("/api/auth/signup", signup_payload),
        ("/api/auth/login", {"username": username, "password": "Password123!"}),
        ("/api/auth/logout", None),
    ):
        missing = client.post(path, json=payload)
        untrusted = client.post(
            path, json=payload, headers={"Origin": "https://evil.example"}
        )
        assert missing.status_code == 403, path
        assert untrusted.status_code == 403, path


def test_login_is_rate_limited(client):
    username = unique("limited")

    for _ in range(10):
        assert login_request(client, username, "wrong-password").status_code == 401

    limited = login_request(client, username, "wrong-password")
    assert limited.status_code == 429
    assert limited.json() == {
        "detail": "Too many attempts. Please try again later."
    }


def test_signup_is_rate_limited(client):
    for _ in range(5):
        assert signup_request(client).status_code == 201

    limited = signup_request(client)
    assert limited.status_code == 429


def test_secure_cookie_is_configurable(client, monkeypatch):
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")

    response = signup_request(client)

    assert response.status_code == 201
    assert "secure" in response.headers["set-cookie"].lower()


def test_short_jwt_secret_is_rejected(monkeypatch):
    monkeypatch.setenv("AUTH_JWT_SECRET", "too-short")

    with pytest.raises(RuntimeError):
        auth_jwt_secret()
