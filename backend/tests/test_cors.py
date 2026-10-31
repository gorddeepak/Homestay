ALLOWED_ORIGIN = "http://localhost:5173"
UNTRUSTED_ORIGIN = "https://evil.example"


def test_allowed_origin_receives_credentialed_cors_headers(client):
    response = client.get(
        "/api/health/live", headers={"Origin": ALLOWED_ORIGIN}
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


def test_untrusted_origin_receives_no_cors_headers(client):
    response = client.get(
        "/api/health/live", headers={"Origin": UNTRUSTED_ORIGIN}
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_preflight_allows_configured_methods_and_headers(client):
    response = client.options(
        "/api/listings",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"

    methods = response.headers["access-control-allow-methods"]
    for method in ("GET", "POST", "PATCH", "DELETE"):
        assert method in methods

    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "content-type" in allowed_headers


def test_preflight_rejects_untrusted_origin(client):
    response = client.options(
        "/api/listings",
        headers={
            "Origin": UNTRUSTED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_cors_does_not_bypass_the_trusted_origin_check(client):
    response = client.post(
        "/api/auth/logout", headers={"Origin": UNTRUSTED_ORIGIN}
    )

    assert response.status_code == 403
    assert "access-control-allow-origin" not in response.headers


def test_allowed_origin_still_passes_the_trusted_origin_check(client):
    response = client.post(
        "/api/auth/logout", headers={"Origin": ALLOWED_ORIGIN}
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"

    # CORS must not widen the auth cookie: it stays host-only and SameSite=Lax.
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Domain=" not in cookie


def test_cors_headers_are_added_to_error_responses(client):
    response = client.get(
        "/api/not-a-real-route", headers={"Origin": ALLOWED_ORIGIN}
    )

    assert response.status_code == 404
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN


def test_cors_headers_are_added_to_body_limit_errors(client):
    response = client.post(
        "/api/ai/generate-description",
        content=b"x" * (16 * 1024 + 1),
        headers={"Origin": ALLOWED_ORIGIN, "Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
