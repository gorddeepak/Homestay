import pytest
from pymongo.errors import PyMongoError

from app import config


def test_liveness_reports_process_health(client):
    response = client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_and_readiness_ping_the_database(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/health/ready").json() == {"status": "ok"}


def test_readiness_reports_an_unavailable_database(client, monkeypatch):
    def unavailable():
        raise PyMongoError("no connection")

    monkeypatch.setattr("app.database.ping", unavailable)

    response = client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}


def test_unknown_environment_is_rejected(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "staging")

    with pytest.raises(RuntimeError, match="ENVIRONMENT"):
        config.environment()


def test_production_requires_explicit_origins(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("AUTH_ALLOWED_ORIGINS", raising=False)

    with pytest.raises(RuntimeError, match="AUTH_ALLOWED_ORIGINS"):
        config.validate_config()


def test_production_rejects_plain_http_origins(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("AUTH_ALLOWED_ORIGINS", "https://example.com,http://example.com")

    with pytest.raises(RuntimeError, match="https://"):
        config.validate_config()


def test_production_always_uses_secure_cookies(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("AUTH_ALLOWED_ORIGINS", "https://example.com")
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "false")

    config.validate_config()

    assert config.auth_cookie_secure() is True


def test_development_keeps_the_local_origin_default(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("AUTH_ALLOWED_ORIGINS", raising=False)

    assert config.auth_allowed_origins() == {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }


def test_chunked_ai_body_is_rejected_without_content_length(client):
    def oversized_body():
        yield b'{"query": "' + b"a" * 20_000 + b'"}'

    response = client.post(
        "/api/listings/ai-search",
        content=oversized_body(),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "That request is too large."}
