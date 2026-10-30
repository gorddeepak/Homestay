from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from . import images
from .auth import get_current_user, require_trusted_origin
from .schemas import ListingImage

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("", response_model=ListingImage)
def upload_listing_image(
    file: UploadFile = File(...),
    _user: dict = Depends(get_current_user),
    _origin: None = Depends(require_trusted_origin),
):
    """Store one listing image and return the fields saved on the listing."""
    content = file.file.read(images.MAX_IMAGE_BYTES + 1)
    if len(content) > images.MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller")
    if images.image_format(content) is None:
        raise HTTPException(
            status_code=422, detail="Only PNG and JPEG images are supported"
        )

    try:
        return images.upload_image(content)
    except images.ImageStorageError as exc:
        raise HTTPException(status_code=502, detail="Image upload failed") from exc
