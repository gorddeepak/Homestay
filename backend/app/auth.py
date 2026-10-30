import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError, PyMongoError
from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import (
    auth_allowed_origins,
    auth_cookie_secure,
    auth_jwt_secret,
)
from .database import get_database
from .schemas import AuthUser, LoginRequest, SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

AUTH_COOKIE_NAME = "homestay_auth"
AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60

# These are the defaults of the legacy passport-local-mongoose 9.1.0 plugin.
PASSWORD_ITERATIONS = 25_000
PASSWORD_KEY_LENGTH = 512
PASSWORD_DIGEST = "sha256"

# Used to spend roughly the same time on unknown usernames as on real ones.
_DUMMY_SALT = "0" * 64
_DUMMY_HASH = "0" * 1024


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """Return a salt and hash in the format used by passport-local-mongoose."""
    salt = salt or secrets.token_hex(32)
    # The plugin passes its hexadecimal salt string to crypto.pbkdf2 as text,
    # so the UTF-8 bytes of that text are the salt here too. It is not decoded.
    digest = hashlib.pbkdf2_hmac(
        PASSWORD_DIGEST,
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
        dklen=PASSWORD_KEY_LENGTH,
    )
    return salt, digest.hex()


def verify_password(password: str, salt: str, stored_hash: str) -> bool:
    """Verify a password against the stored passport-local-mongoose hash."""
    if not isinstance(salt, str) or not isinstance(stored_hash, str):
        return False

    digest = hashlib.pbkdf2_hmac(
        PASSWORD_DIGEST,
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
        dklen=PASSWORD_KEY_LENGTH,
    )
    return hmac.compare_digest(digest.hex(), stored_hash)


def _password_matches(user: dict | None, password: str) -> bool:
    salt = user.get("salt") if user else None
    stored_hash = user.get("hash") if user else None
    if not salt or not stored_hash:
        verify_password(password, _DUMMY_SALT, _DUMMY_HASH)
        return False
    return verify_password(password, salt, stored_hash)


def create_token(user_id: ObjectId) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + timedelta(seconds=AUTH_COOKIE_MAX_AGE),
        },
        auth_jwt_secret(),
        algorithm="HS256",
    )


def _user_id_from_token(token: str) -> ObjectId | None:
    try:
        payload = jwt.decode(
            token,
            auth_jwt_secret(),
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        return None

    subject = payload.get("sub")
    if not isinstance(subject, str) or not ObjectId.is_valid(subject):
        return None
    return ObjectId(subject)


def get_current_user(
    request: Request, db: Database = Depends(get_database)
) -> dict:
    """Return the user identified by the auth cookie, or reject the request."""
    token = request.cookies.get(AUTH_COOKIE_NAME)
    user_id = _user_id_from_token(token) if token else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        user = db.users.find_one(
            {"_id": user_id}, {"username": 1, "email": 1}
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_trusted_origin(request: Request) -> None:
    """Reject state-changing requests that did not come from an allowed origin."""
    origin = request.headers.get("origin")
    if not origin or origin.rstrip("/") not in auth_allowed_origins():
        raise HTTPException(status_code=403, detail="Request origin is not allowed")


def _public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "email": user["email"],
    }


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=AUTH_COOKIE_MAX_AGE,
        path="/",
        httponly=True,
        secure=auth_cookie_secure(),
        samesite="lax",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=auth_cookie_secure(),
        samesite="lax",
    )


@router.post("/signup", response_model=AuthUser, status_code=201)
@limiter.limit("5/minute")
def signup(
    request: Request,
    response: Response,
    payload: SignupRequest,
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    if not payload.username.strip():
        raise HTTPException(status_code=422, detail="Username is required")

    salt, password_hash = hash_password(payload.password)
    document = {
        "username": payload.username,
        "email": payload.email,
        "salt": salt,
        "hash": password_hash,
        "__v": 0,
    }

    try:
        if db.users.find_one({"username": payload.username}, {"_id": 1}):
            raise HTTPException(status_code=409, detail="Username is already taken")
        result = db.users.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=409, detail="Username is already taken"
        ) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    _set_auth_cookie(response, create_token(result.inserted_id))
    return _public_user({"_id": result.inserted_id, **document})


@router.post("/login", response_model=AuthUser)
@limiter.limit("10/minute")
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    try:
        user = db.users.find_one({"username": payload.username})
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    if not _password_matches(user, payload.password):
        raise HTTPException(
            status_code=401, detail="Invalid username or password"
        )

    _set_auth_cookie(response, create_token(user["_id"]))
    return _public_user(user)


@router.post("/logout")
def logout(
    response: Response,
    _: None = Depends(require_trusted_origin),
):
    _clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=AuthUser)
def me(user: dict = Depends(get_current_user)):
    return _public_user(user)
