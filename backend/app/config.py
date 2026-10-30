import os
from pathlib import Path

from dotenv import load_dotenv

# Keep the backend's configuration separate from the Express app's root .env.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def environment() -> str:
    """Return the runtime environment, which must be set explicitly.

    Development is the default so a local checkout works out of the box. A
    deployment must set ``ENVIRONMENT=production``; otherwise the development
    origin defaults apply and state-changing requests are rejected.
    """
    value = os.getenv("ENVIRONMENT", "development").strip().lower()
    if value not in {"development", "production"}:
        raise RuntimeError('ENVIRONMENT must be "development" or "production".')
    return value


def is_production() -> bool:
    return environment() == "production"


def database_url() -> str:
    """Return the MongoDB connection string, including the database name."""
    url = os.getenv("ATLAS_DB_URL", "").strip()
    if not url:
        raise RuntimeError(
            "ATLAS_DB_URL is not set. Copy backend/.env.example to backend/.env "
            "and provide a MongoDB connection string that includes the database name."
        )
    return url


def auth_jwt_secret() -> str:
    """Return the secret used to sign authentication cookies."""
    secret = os.getenv("AUTH_JWT_SECRET", "").strip()
    if len(secret) < 32:
        raise RuntimeError(
            "AUTH_JWT_SECRET must be set to at least 32 characters. Generate one "
            'with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    return secret


def auth_cookie_secure() -> bool:
    """Return whether auth cookies require HTTPS.

    Production always uses Secure cookies so a missing environment variable
    cannot silently send an authentication cookie over plain HTTP.
    """
    if is_production():
        return True
    return os.getenv("AUTH_COOKIE_SECURE", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def cloudinary_config() -> dict[str, str] | None:
    """Return Cloudinary credentials, or None when image uploads are not set up."""
    values = {
        "cloud_name": os.getenv("CLOUD_NAME", "").strip(),
        "api_key": os.getenv("CLOUD_API_KEY", "").strip(),
        "api_secret": os.getenv("CLOUD_API_SECRET", "").strip(),
    }
    if not all(values.values()):
        return None
    return values


def maptiler_api_key() -> str:
    """Return the MapTiler key, or an empty string when maps are not configured."""
    return os.getenv("MAPTILER_API_KEY", "").strip()


def gemini_api_key() -> str:
    """Return the Gemini API key used by the FastAPI AI features."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env to enable AI features."
        )
    return key


def gemini_model() -> str:
    """Return the single Gemini model used for every AI feature."""
    return os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip() or (
        "gemini-3.5-flash-lite"
    )


def gemini_timeout_seconds() -> float:
    """Return the per-request Gemini timeout, bounded to a sensible range."""
    raw = os.getenv("GEMINI_TIMEOUT_SECONDS", "20").strip()
    try:
        value = float(raw)
    except ValueError:
        return 20.0
    return value if 1 <= value <= 120 else 20.0


def auth_allowed_origins() -> set[str]:
    """Return the browser origins allowed to make state-changing auth requests.

    Production deployments must list their origins explicitly; there is no
    localhost fallback. An empty set denies every state-changing request.
    """
    raw = os.getenv("AUTH_ALLOWED_ORIGINS", "").strip()
    if not raw:
        if is_production():
            return set()
        raw = "http://localhost:5173,http://127.0.0.1:5173"
    return {
        origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()
    }


def validate_config() -> None:
    """Fail fast when required or unsafe configuration would reach production.

    Called once during application startup. Optional providers (Gemini,
    Cloudinary, MapTiler) are not required: the API stays usable without them
    and the related features report themselves as unavailable.
    """
    database_url()
    auth_jwt_secret()
    origins = auth_allowed_origins()

    if not is_production():
        return

    if not origins:
        raise RuntimeError(
            "AUTH_ALLOWED_ORIGINS must list the production browser origins "
            "(for example https://example.com)."
        )

    insecure = sorted(origin for origin in origins if not origin.startswith("https://"))
    if insecure:
        raise RuntimeError(
            "Production AUTH_ALLOWED_ORIGINS must use https://. Rejected: "
            + ", ".join(insecure)
        )
