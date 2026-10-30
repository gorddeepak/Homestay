import math
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

# Mirrors the CATEGORIES list in the Express schema.js, which is the original
# source of truth for listing categories.
CATEGORIES = (
    "Mountain Escape",
    "Lakefront Retreat",
    "Snowy Peaks",
    "Coastal Haven",
    "Woodland Hideaway",
    "Desert Sanctuary",
    "Rural Charm",
    "Urban Oasis",
    "Hill Station",
    "Heritage Homestay",
    "Houseboat",
)


def _check_category(value: str) -> str:
    if value not in CATEGORIES:
        raise ValueError(f"must be one of: {', '.join(CATEGORIES)}")
    return value


Category = Annotated[str, AfterValidator(_check_category)]


class GeoPoint(BaseModel):
    """GeoJSON Point in MongoDB's [longitude, latitude] order."""

    type: Literal["Point"]
    coordinates: list[float] = Field(min_length=2, max_length=2)

    @field_validator("coordinates")
    @classmethod
    def _validate_coordinates(cls, value: list[float]) -> list[float]:
        longitude, latitude = value
        if not (math.isfinite(longitude) and math.isfinite(latitude)):
            raise ValueError("coordinates must be finite numbers")
        if not -180 <= longitude <= 180:
            raise ValueError("longitude must be between -180 and 180")
        if not -90 <= latitude <= 90:
            raise ValueError("latitude must be between -90 and 90")
        return value


class ListingImage(BaseModel):
    """The image object stored on a listing (Cloudinary URL and public id)."""

    url: str = Field(min_length=1, max_length=2000)
    filename: str = Field(min_length=1, max_length=300)

    @field_validator("url")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        if not (value.startswith("https://") or value.startswith("/")):
            raise ValueError("image url must start with https:// or /")
        return value


class Owner(BaseModel):
    id: str
    username: str


class ListingCard(BaseModel):
    id: str
    title: str | None
    price: int | float | None
    location: str | None
    country: str | None
    category: str | None
    image_url: str | None


class ListingDetail(ListingCard):
    description: str | None
    owner: Owner | None
    geometry: GeoPoint | None


class ListingCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    price: int = Field(ge=0)
    location: str = Field(min_length=1, max_length=200)
    country: str = Field(min_length=1, max_length=100)
    category: Category
    image: ListingImage
    geometry: GeoPoint | None = None


class ListingUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    price: int | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    country: str | None = Field(default=None, min_length=1, max_length=100)
    category: Category | None = None
    image: ListingImage | None = None
    geometry: GeoPoint | None = None


def _reject_bool(value):
    # Python treats True as 1; an explicit rating must be a real integer.
    if isinstance(value, bool):
        raise ValueError("rating must be an integer from 1 to 5")
    return value


# Mirrors ReviewSchema in the Express schema.js: an integer rating and a
# non-empty comment. 2000 characters is a new API safety limit.
Rating = Annotated[int, BeforeValidator(_reject_bool), Field(ge=1, le=5)]


class ReviewCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    rating: Rating
    comment: str = Field(min_length=1, max_length=2000)


class ReviewUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    rating: Rating | None = None
    comment: str | None = Field(default=None, min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _require_change(self):
        if self.rating is None and self.comment is None:
            raise ValueError("provide a rating or comment to update")
        return self


class ReviewPublic(BaseModel):
    id: str
    rating: int | None
    comment: str | None
    author: Owner | None
    created_at: datetime | None


class DescriptionRequest(BaseModel):
    """Listing details used to generate or refine a description."""

    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1, max_length=200)
    country: str | None = Field(default=None, max_length=100)
    category: Category
    details: str | None = Field(default=None, max_length=1000)


class DescriptionResponse(BaseModel):
    description: str


class SearchRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    query: str = Field(min_length=1, max_length=300)


class SearchFilters(BaseModel):
    """The only criteria the model may extract from a natural-language query."""

    location: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=100)
    min_price: float | None = None
    max_price: float | None = None


class SearchResponse(BaseModel):
    listings: list[ListingCard]
    filters: SearchFilters


class SignupRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    # No upper bounds here: existing Express users may have longer values.
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AuthUser(BaseModel):
    id: str
    username: str
    email: str
