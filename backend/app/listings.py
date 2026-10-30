import logging

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from pymongo.errors import PyMongoError

from . import geocoding, images
from .auth import get_current_user, require_trusted_origin
from .database import get_database
from .schemas import (
    GeoPoint,
    ListingCard,
    ListingCreate,
    ListingDetail,
    ListingUpdate,
    Owner,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/listings", tags=["listings"])


def _image_url(document: dict) -> str | None:
    image = document.get("image")
    if not isinstance(image, dict):
        return None
    url = image.get("url")
    return url or None


def _card_fields(document: dict) -> dict:
    return {
        "id": str(document["_id"]),
        "title": document.get("title"),
        "price": document.get("price"),
        "location": document.get("location"),
        "country": document.get("country"),
        "category": document.get("category"),
        "image_url": _image_url(document),
    }


def _owner(db: Database, owner_id) -> Owner | None:
    # Only the username is public; never return email, salt, or hash.
    if not isinstance(owner_id, ObjectId):
        return None

    user = db.users.find_one({"_id": owner_id}, {"username": 1})
    username = user.get("username") if user else None
    if not isinstance(username, str):
        return None

    return Owner(id=str(user["_id"]), username=username)


def _geometry(document: dict) -> dict | None:
    """Return stored geometry only when it is a usable GeoJSON Point."""
    geometry = document.get("geometry")
    if not isinstance(geometry, dict):
        return None
    try:
        return GeoPoint.model_validate(geometry).model_dump()
    except ValueError:
        # Malformed legacy geometry must not break the whole listing response.
        return None


def _detail_fields(db: Database, document: dict) -> dict:
    detail = _card_fields(document)
    detail["description"] = document.get("description")
    detail["owner"] = _owner(db, document.get("owner"))
    detail["geometry"] = _geometry(document)
    return detail


def _detail_or_503(db: Database, document: dict) -> dict:
    try:
        return _detail_fields(db, document)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


def _owned_listing(db: Database, listing_id: str, user: dict) -> dict:
    """Return a listing owned by the authenticated user, or reject the request."""
    if not ObjectId.is_valid(listing_id):
        raise HTTPException(status_code=400, detail="Invalid listing id")

    try:
        document = db.listings.find_one({"_id": ObjectId(listing_id)})
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    # Another user's listing is reported as missing so the API does not reveal
    # it. The owner comparison uses the stored ObjectId, never client input.
    if document is None or document.get("owner") != user["_id"]:
        raise HTTPException(status_code=404, detail="Listing not found")
    return document


def _geocode_location(location: str) -> dict:
    try:
        return geocoding.geocode(location)
    except geocoding.LocationNotFound as exc:
        raise HTTPException(
            status_code=422,
            detail="Location could not be found. Check the location and try again.",
        ) from exc
    except geocoding.GeocodingUnavailable as exc:
        raise HTTPException(
            status_code=503, detail="Location service is unavailable"
        ) from exc


def _delete_image_if_unused(db: Database, image: object) -> None:
    """Delete a Cloudinary asset only when no listing still references it.

    MongoDB and Cloudinary are not one transaction, so cleanup is best effort
    and never breaks an otherwise successful request.
    """
    if not images.is_cloudinary_image(image):
        return
    try:
        if db.listings.count_documents({"image.filename": image["filename"]}) > 0:
            return
        images.delete_image(image["filename"])
    except (PyMongoError, images.ImageStorageError):
        logger.warning("Could not delete unused image %s", image.get("filename"))


@router.get("", response_model=list[ListingCard])
def list_listings(db: Database = Depends(get_database)):
    try:
        # The existing browse page uses natural order with client-side category
        # filtering, so no server-side filtering or pagination is needed here.
        return [_card_fields(document) for document in db.listings.find({})]
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


# Declared before /{listing_id} so "mine" is not parsed as a listing id.
@router.get("/mine", response_model=list[ListingDetail])
def list_my_listings(
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_database),
):
    try:
        documents = db.listings.find({"owner": user["_id"]})
        return [_detail_fields(db, document) for document in documents]
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


@router.get("/{listing_id}", response_model=ListingDetail)
def get_listing(listing_id: str, db: Database = Depends(get_database)):
    if not ObjectId.is_valid(listing_id):
        raise HTTPException(status_code=400, detail="Invalid listing id")

    try:
        document = db.listings.find_one({"_id": ObjectId(listing_id)})
        if document is None:
            raise HTTPException(status_code=404, detail="Listing not found")

        return _detail_fields(db, document)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


@router.post("", response_model=ListingDetail, status_code=201)
def create_listing(
    payload: ListingCreate,
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    # Ownership always comes from the verified session; any owner field in the
    # request body is ignored because the schema does not accept one.
    document = payload.model_dump()
    document["owner"] = user["_id"]
    document["review"] = []
    document["__v"] = 0

    if document["geometry"] is None:
        document["geometry"] = _geocode_location(payload.location)

    try:
        result = db.listings.insert_one(document)
    except PyMongoError as exc:
        _delete_image_if_unused(db, payload.image.model_dump())
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    return _detail_or_503(db, {"_id": result.inserted_id, **document})


@router.patch("/{listing_id}", response_model=ListingDetail)
def update_listing(
    listing_id: str,
    payload: ListingUpdate,
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    existing = _owned_listing(db, listing_id, user)

    updates = payload.model_dump(
        exclude_unset=True, exclude={"geometry", "image"}, exclude_none=True
    )

    new_image = payload.image.model_dump() if payload.image is not None else None
    old_image = existing.get("image")
    if new_image is not None:
        updates["image"] = new_image

    if payload.location is not None and payload.location != existing.get("location"):
        # Only re-geocode when the free-text location actually changed, so an
        # unrelated edit cannot drop or replace valid existing geometry.
        updates["geometry"] = _geocode_location(payload.location)
    elif payload.geometry is not None:
        updates["geometry"] = payload.geometry.model_dump()

    if updates:
        try:
            db.listings.update_one({"_id": existing["_id"]}, {"$set": updates})
        except PyMongoError as exc:
            _delete_image_if_unused(db, new_image)
            raise HTTPException(status_code=503, detail="Database unavailable") from exc

        if new_image is not None and old_image != new_image:
            _delete_image_if_unused(db, old_image)

    return _detail_or_503(db, {**existing, **updates})


@router.delete("/{listing_id}/image")
def delete_listing_image(
    listing_id: str,
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    existing = _owned_listing(db, listing_id, user)
    image = existing.get("image")

    try:
        db.listings.update_one({"_id": existing["_id"]}, {"$unset": {"image": ""}})
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    _delete_image_if_unused(db, image)
    return {"ok": True}


@router.delete("/{listing_id}")
def delete_listing(
    listing_id: str,
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    existing = _owned_listing(db, listing_id, user)
    # Deleting a listing also removes the reviews it references.
    review_ids = [
        review_id
        for review_id in existing.get("review") or []
        if isinstance(review_id, ObjectId)
    ]

    try:
        db.listings.delete_one({"_id": existing["_id"]})
        if review_ids:
            db.reviews.delete_many({"_id": {"$in": review_ids}})
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    _delete_image_if_unused(db, existing.get("image"))
    return {"ok": True}
