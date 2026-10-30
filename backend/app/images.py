"""Cloudinary image storage for listing photos.

The Express application uses multer-storage-cloudinary in the ``airbnb_DEV``
folder and stores the upload result as ``{url, filename}`` on the listing,
where ``filename`` is the Cloudinary public id. This module keeps that format.
"""

import logging

import cloudinary
import cloudinary.uploader
from cloudinary.exceptions import Error as CloudinaryError

from .config import cloudinary_config

logger = logging.getLogger(__name__)

CLOUDINARY_FOLDER = "airbnb_DEV"
# The formats the existing Express upload accepts.
ALLOWED_FORMATS = ["png", "jpg", "jpeg"]
MAX_IMAGE_BYTES = 5 * 1024 * 1024


class ImageStorageError(Exception):
    """Raised when the image provider cannot complete a request."""


def image_format(content: bytes) -> str | None:
    """Detect the image type from its signature instead of trusting the upload."""
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg"
    return None


def upload_image(content: bytes) -> dict:
    """Upload image bytes and return the fields stored on a listing."""
    credentials = cloudinary_config()
    if credentials is None:
        raise ImageStorageError("Cloudinary is not configured")

    try:
        cloudinary.config(secure=True, **credentials)
        result = cloudinary.uploader.upload(
            content,
            folder=CLOUDINARY_FOLDER,
            allowed_formats=ALLOWED_FORMATS,
            resource_type="image",
        )
    except CloudinaryError as exc:
        raise ImageStorageError("Image upload failed") from exc

    url = result.get("secure_url")
    public_id = result.get("public_id")
    if not isinstance(url, str) or not isinstance(public_id, str):
        raise ImageStorageError("Image upload returned an unexpected result")
    return {"url": url, "filename": public_id}


def is_cloudinary_image(image: object) -> bool:
    """Return True when a stored image is a Cloudinary asset we may delete.

    Seeded listings store an arbitrary ``filename`` even for Unsplash and
    local ``/images`` URLs, so the URL host is the only reliable signal.
    """
    if not isinstance(image, dict):
        return False
    url = image.get("url")
    filename = image.get("filename")
    return (
        isinstance(filename, str)
        and bool(filename)
        and isinstance(url, str)
        and url.startswith("https://res.cloudinary.com/")
    )


def delete_image(public_id: str) -> None:
    """Delete an image from Cloudinary. Raises ImageStorageError on failure."""
    credentials = cloudinary_config()
    if credentials is None:
        raise ImageStorageError("Cloudinary is not configured")

    try:
        cloudinary.config(secure=True, **credentials)
        cloudinary.uploader.destroy(public_id, invalidate=True)
    except CloudinaryError as exc:
        raise ImageStorageError("Image deletion failed") from exc
    logger.info("Deleted Cloudinary image %s", public_id)
