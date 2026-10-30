from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
from slowapi.errors import RateLimitExceeded

from . import database
from .ai import router as ai_router
from .auth import limiter, router as auth_router
from .config import maptiler_api_key, validate_config
from .listings import router as listings_router
from .reviews import router as reviews_router
from .uploads import router as uploads_router

# The single-prompt AI endpoints accept small JSON bodies. Chat carries a short
# conversation, so it gets a larger but still bounded cap.
AI_MAX_REQUEST_BYTES = 16 * 1024
CHAT_MAX_REQUEST_BYTES = 64 * 1024
AI_BODY_LIMITS = {
    "/api/ai/generate-description": AI_MAX_REQUEST_BYTES,
    "/api/listings/ai-search": AI_MAX_REQUEST_BYTES,
    "/api/ai/chat": CHAT_MAX_REQUEST_BYTES,
}


async def _reject(scope, receive, send, status_code: int, detail: str) -> None:
    response = JSONResponse(status_code=status_code, content={"detail": detail})
    await response(scope, receive, send)


class RequestBodyLimitMiddleware:
    """Reject oversized request bodies before the application parses them.

    FastAPI reads and parses JSON bodies itself, so the limit has to be applied
    to the raw stream. Each body is buffered up to its limit and then replayed
    to the app, which also bounds chunked requests that have no Content-Length.
    """

    def __init__(self, app, limits: dict[str, int]):
        self.app = app
        self.limits = limits

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self.limits.get(scope.get("path"))
        if limit is None:
            await self.app(scope, receive, send)
            return

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] != "http.request":
                # The client disconnected before sending a complete body.
                return
            body.extend(message.get("body", b""))
            if len(body) > limit:
                await _reject(scope, receive, send, 413, "That request is too large.")
                return
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay_receive():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {
                    "type": "http.request",
                    "body": bytes(body),
                    "more_body": False,
                }
            return await receive()

        await self.app(scope, replay_receive, send)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_config()
    database.connect()
    yield
    database.close()


def _rate_limit_exceeded(_request: Request, _exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many attempts. Please try again later."},
    )


def _validation_failed(_request: Request, exc: RequestValidationError):
    # Do not echo submitted values: a validation error can otherwise include
    # a password from the request body.
    errors = [
        {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


app = FastAPI(title="EazyInvites API", version="0.6.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_middleware(RequestBodyLimitMiddleware, limits=AI_BODY_LIMITS)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded)
app.add_exception_handler(RequestValidationError, _validation_failed)
app.include_router(listings_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(reviews_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(uploads_router, prefix="/api")


@app.get("/api/config")
def client_config():
    """Public browser configuration.

    MapTiler browser keys are public and origin-restricted in the MapTiler
    dashboard. No Cloudinary credentials or other secrets are returned.
    """
    return {"maptiler_key": maptiler_api_key() or None}


@app.get("/api/health")
def health():
    try:
        database.ping()
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok"}


@app.get("/api/health/live")
def liveness():
    """Report that the process is running. Used by container restarts."""
    return {"status": "ok"}


@app.get("/api/health/ready")
def readiness():
    """Report whether the API can serve requests, including its database."""
    try:
        database.ping()
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok"}
