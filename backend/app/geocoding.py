"""MapTiler forward geocoding used by listing create/update.

The original application turns a free-text location into a GeoJSON Point on
create, and again only when the location changes during an edit. The browser
never sends geometry; it renders the stored Point on the detail page.
"""

from urllib.parse import quote

import httpx
from pydantic import ValidationError

from .config import maptiler_api_key
from .schemas import GeoPoint

GEOCODING_URL = "https://api.maptiler.com/geocoding/{location}.json"
REQUEST_TIMEOUT_SECONDS = 10


class GeocodingUnavailable(Exception):
    """The MapTiler key is missing or the service could not be reached."""


class LocationNotFound(Exception):
    """MapTiler had no usable point for the supplied location."""


def geocode(location: str) -> dict:
    """Return a validated GeoJSON Point for a free-text location."""
    key = maptiler_api_key()
    if not key:
        raise GeocodingUnavailable("MapTiler is not configured")

    try:
        response = httpx.get(
            GEOCODING_URL.format(location=quote(location, safe="")),
            params={"key": key, "limit": 1},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        features = response.json().get("features") or []
    except (httpx.HTTPError, ValueError) as exc:
        raise GeocodingUnavailable("MapTiler request failed") from exc

    if not features:
        raise LocationNotFound(location)

    try:
        point = GeoPoint.model_validate(features[0].get("geometry") or {})
    except ValidationError as exc:
        raise LocationNotFound(location) from exc
    return point.model_dump()
