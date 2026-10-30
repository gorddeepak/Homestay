import json
from datetime import datetime, timedelta, timezone
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

# Generated once by passport-local-mongoose 9.1.0. Keeping a fixed vector proves
# the Python implementation still matches the hashes stored by legacy users
# without requiring Node or the old Mongoose models at test time.
LEGACY_PASSWORD = "NodeCompatible123!é🔐"
LEGACY_SALT = "00e9da7c6923f2fd20258387b78138def313051b36d7cc9d0e4608be08f53127"
LEGACY_HASH = (
    "7ba6a86106c9f6624005b357040cce87f6a86ff099131326b91fe4020b2b9af3"
    "2677fb93d973ad909af4447a8ac9ac0358d2c31ad269b451290d6285c5ee53b4"
    "6a2b5118bedadd031440fcaeaf6aa7e3eea2a07a447f846308e6a244f5bc9e438"
    "7bac16039cd290b11a806ab93917c33aa8e803ebbbeb683fdb4896b4474ac58e6"
    "c4ab2d6d41bc65d9cf44089dea6a2fa0de20c8d149e8e87f90ebcbb02efa78af"
    "004f4eb17c629415dca259074bfd24b0c8bb89e8d2a059cd59eb569da0f62d5d"
    "825a878706ac3e045e9918dda1f7333e2c8e3875f9d9f9a88ea9fb7f3cee56e2"
    "b8ba8b9a0b03041d44379ae61d43e5343093b20bc5ea22ca3a15204c31399623"
    "cb33d8705b14e4b04034b1386eb69fcdbbe0fc58a4a820e759db6b569fcbdcb3"
    "0b38a33c21e60b23dd1b5fa91cf01b698dba47fa7631b7a494f4581a3bb1fdc"
    "4c32b5705e561db15ca035b768119be5b61ed495a3e69826157ab04449c58897"
    "d17f6b5da58b375c6746e89a7f117ff6142ca68318db34d092a13d80e89233cc"
    "b18209d2680d574608b0ef718317a3e712ccdcc44f6daea7743062ea9c77fc4e"
    "c0a504fb3b1ff3e6014d125fdac32a05a6991e044d2a3d62694423a3c61eef8"
    "bb3b3a92b5e9560e047d58b22621f463337604dbff36c4a0d5146efbfa2dc22f"
    "b9c7e82fb40f86381a7f79712252616140fdea70e32a6d40d914e5f9f10d8c4b"
)


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


def decode_token(token):
    return jwt.decode(token, auth_jwt_secret(), algorithms=["HS256"])


def me_with_token(client, token):
    client.cookies.set(AUTH_COOKIE_NAME, token, domain="testserver", path="/")
    return client.get("/api/auth/me")


def test_python_verifies_hash_generated_by_passport_local_mongoose():
    assert len(LEGACY_SALT) == 64
    assert len(LEGACY_HASH) == 1024

    assert verify_password(LEGACY_PASSWORD, LEGACY_SALT, LEGACY_HASH)
    assert not verify_password("not-the-password", LEGACY_SALT, LEGACY_HASH)

    # Reusing the plugin's salt must produce the exact same hash.
    salt, password_hash = hash_password(LEGACY_PASSWORD, LEGACY_SALT)
    assert salt == LEGACY_SALT
    assert password_hash == LEGACY_HASH


def test_signup_stores_passport_local_compatible_hash(client, database):
    username = unique("passport")
    password = "PassportCompatible123!é"
    response = signup_request(client, username=username, password=password)
    assert response.status_code == 201

    user = database.users.find_one({"username": username})
    assert user is not None
    assert len(user["salt"]) == 64
    assert len(user["hash"]) == 1024
    assert verify_password(password, user["salt"], user["hash"])
    assert not verify_password("wrong-password", user["salt"], user["hash"])


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
