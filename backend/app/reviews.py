import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from pymongo.errors import PyMongoError

from .auth import get_current_user, require_trusted_origin
from .database import get_database
from .schemas import Owner, ReviewCreate, ReviewPublic, ReviewUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/listings", tags=["reviews"])


def _listing_or_404(db: Database, listing_id: str) -> dict:
    if not ObjectId.is_valid(listing_id):
        raise HTTPException(status_code=400, detail="Invalid listing id")

    try:
        listing = db.listings.find_one({"_id": ObjectId(listing_id)})
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


def _public_review(document: dict, usernames: dict) -> dict:
    # Historical reviews may be incomplete. Report missing or malformed values
    # as null rather than inventing a rating or comment.
    rating = document.get("rating")
    if isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= rating <= 5:
        rating = None

    comment = document.get("comment")
    if not isinstance(comment, str):
        comment = None

    author = None
    author_id = document.get("author")
    if isinstance(author_id, ObjectId):
        username = usernames.get(author_id)
        if isinstance(username, str):
            author = Owner(id=str(author_id), username=username)

    created_at = document.get("createdAt")
    if isinstance(created_at, datetime):
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
    else:
        created_at = None

    return {
        "id": str(document["_id"]),
        "rating": rating,
        "comment": comment,
        "author": author,
        "created_at": created_at,
    }


def _author_review(
    db: Database, listing_id: str, review_id: str, user: dict
) -> tuple[dict, dict]:
    """Return the listing and a review the user wrote on that listing.

    A review that exists on another listing, is missing, or belongs to another
    user is reported as not found so the API does not disclose it.
    """
    listing = _listing_or_404(db, listing_id)

    review_object_id = ObjectId(review_id) if ObjectId.is_valid(review_id) else None
    listed_ids = [
        review_object_id
        for review_object_id in listing.get("review") or []
        if isinstance(review_object_id, ObjectId)
    ]

    try:
        review = (
            db.reviews.find_one({"_id": review_object_id})
            if review_object_id is not None
            else None
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    if (
        review is None
        or review["_id"] not in listed_ids
        or review.get("author") != user["_id"]
    ):
        raise HTTPException(status_code=404, detail="Review not found")
    return listing, review


@router.get("/{listing_id}/reviews", response_model=list[ReviewPublic])
def list_reviews(listing_id: str, db: Database = Depends(get_database)):
    listing = _listing_or_404(db, listing_id)
    review_ids = [
        review_id
        for review_id in listing.get("review") or []
        if isinstance(review_id, ObjectId)
    ]
    if not review_ids:
        return []

    try:
        reviews = {
            document["_id"]: document
            for document in db.reviews.find({"_id": {"$in": review_ids}})
        }
        author_ids = {
            document.get("author")
            for document in reviews.values()
            if isinstance(document.get("author"), ObjectId)
        }
        usernames = {
            user["_id"]: user.get("username")
            for user in db.users.find(
                {"_id": {"$in": list(author_ids)}}, {"username": 1}
            )
        }
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    # Follow the listing's reference order and skip references whose review no
    # longer exists.
    return [
        _public_review(reviews[review_id], usernames)
        for review_id in review_ids
        if review_id in reviews
    ]


@router.post("/{listing_id}/reviews", response_model=ReviewPublic, status_code=201)
def create_review(
    listing_id: str,
    payload: ReviewCreate,
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    listing = _listing_or_404(db, listing_id)

    document = {
        "rating": payload.rating,
        "comment": payload.comment,
        "createdAt": datetime.now(timezone.utc),
        # The author always comes from the verified session, never the body.
        "author": user["_id"],
        "__v": 0,
    }

    try:
        result = db.reviews.insert_one(document)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    try:
        db.listings.update_one(
            {"_id": listing["_id"]}, {"$push": {"review": result.inserted_id}}
        )
    except PyMongoError as exc:
        # Keep the review collection consistent if the reference cannot be added.
        try:
            db.reviews.delete_one({"_id": result.inserted_id})
        except PyMongoError:
            logger.warning("Could not roll back review %s", result.inserted_id)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    return _public_review(
        {"_id": result.inserted_id, **document}, {user["_id"]: user["username"]}
    )


@router.patch("/{listing_id}/reviews/{review_id}", response_model=ReviewPublic)
def update_review(
    listing_id: str,
    review_id: str,
    payload: ReviewUpdate,
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    _, review = _author_review(db, listing_id, review_id, user)

    updates = payload.model_dump(exclude_none=True)
    try:
        db.reviews.update_one({"_id": review["_id"]}, {"$set": updates})
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    return _public_review(
        {**review, **updates}, {user["_id"]: user["username"]}
    )


@router.delete("/{listing_id}/reviews/{review_id}")
def delete_review(
    listing_id: str,
    review_id: str,
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(require_trusted_origin),
):
    listing, review = _author_review(db, listing_id, review_id, user)

    try:
        # The listing filter keeps the reference removal tied to the listing
        # that actually contains this review.
        db.listings.update_one(
            {"_id": listing["_id"], "review": review["_id"]},
            {"$pull": {"review": review["_id"]}},
        )
        db.reviews.delete_one({"_id": review["_id"]})
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    return {"ok": True}
