def test_seeded_listing_image_is_served(client):
    response = client.get("/images/manali.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_missing_static_image_returns_404(client):
    response = client.get("/images/not-a-real-image.png")
    assert response.status_code == 404
