from math import radians, sin, cos, sqrt, atan2
from pathlib import Path
from uuid import uuid4
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.fault import Fault
from app.models.marker import Marker
from app.models.user import User
from app.schemas.fault import FaultResponse
from app.schemas.marker import (
    MarkerCreate,
    MarkerBulkCreate,
    MarkerUpdate,
    MarkerResponse,
)

router = APIRouter(prefix="/markers", tags=["markers"])

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MARKER_IMAGE_DIR = PROJECT_ROOT / "uploads" / "markers"
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_MARKER_UPLOAD_FILES = 30
MAX_MARKER_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB per marker image


def _image_filename_from_marker(marker: Marker) -> Optional[str]:
    """Store image filename in description as `image:<filename>` to avoid schema migration churn."""
    description = marker.description or ""
    if description.startswith("image:"):
        return description.split("image:", 1)[1] or None
    return None


def _marker_image_url(marker: Marker) -> Optional[str]:
    return f"/api/markers/{marker.marker_id}/image" if _image_filename_from_marker(marker) else None


def _serialize_marker(marker: Marker) -> dict:
    payload = MarkerResponse.model_validate(marker).model_dump()
    payload["image_url"] = _marker_image_url(marker)
    return payload


def _derive_extension_from_content(content: bytes, original_name: str | None) -> str:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP":
        return ".webp"

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported or invalid image file: {original_name or 'unknown file'}",
    )


def _next_marker_id() -> str:
    return f"MKR-{uuid4().hex[:8].upper()}"


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6371000
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)

    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    )
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earth_radius_m * c


def _serialize_fault_with_distance(fault: Fault, marker: Marker) -> dict:
    payload = FaultResponse.model_validate(fault).model_dump()
    payload["distance_from_marker_m"] = None

    if (
        marker.latitude is not None
        and marker.longitude is not None
        and fault.latitude is not None
        and fault.longitude is not None
    ):
        payload["distance_from_marker_m"] = round(
            _distance_meters(marker.latitude, marker.longitude, fault.latitude, fault.longitude),
            2,
        )

    return payload


@router.get("", response_model=List[MarkerResponse])
def list_markers(
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Marker)
    if active_only:
        query = query.filter(Marker.is_active.is_(True))
    markers = query.order_by(Marker.created_at.desc()).all()
    return [_serialize_marker(marker) for marker in markers]


@router.post("", response_model=MarkerResponse, status_code=status.HTTP_201_CREATED)
def create_marker(
    payload: MarkerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(Marker).filter(Marker.marker_id == payload.marker_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Marker ID already exists")

    marker = Marker(**payload.model_dump(), created_by_id=current_user.id)
    db.add(marker)
    db.commit()
    db.refresh(marker)
    return _serialize_marker(marker)


@router.post("/bulk", response_model=List[MarkerResponse], status_code=status.HTTP_201_CREATED)
def create_markers_bulk(
    payload: MarkerBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not payload.markers:
        raise HTTPException(status_code=400, detail="No markers provided")

    marker_ids = [item.marker_id for item in payload.markers]
    existing = db.query(Marker.marker_id).filter(Marker.marker_id.in_(marker_ids)).all()
    existing_ids = {row[0] for row in existing}
    if existing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Duplicate marker IDs already exist: {sorted(existing_ids)}",
        )

    created_markers = []
    for item in payload.markers:
        marker = Marker(**item.model_dump(), created_by_id=current_user.id)
        db.add(marker)
        created_markers.append(marker)

    db.commit()
    for marker in created_markers:
        db.refresh(marker)

    return [_serialize_marker(marker) for marker in created_markers]


@router.post("/upload", response_model=List[MarkerResponse], status_code=status.HTTP_201_CREATED)
async def upload_marker_images(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not files:
        raise HTTPException(status_code=400, detail="No marker images uploaded")
    if len(files) > MAX_MARKER_UPLOAD_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Upload up to {MAX_MARKER_UPLOAD_FILES} images at a time.",
        )

    MARKER_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    created_markers = []
    for upload in files:
        content = await upload.read(MAX_MARKER_IMAGE_BYTES + 1)
        if not content:
            raise HTTPException(status_code=400, detail=f"Uploaded file is empty: {upload.filename}")
        if len(content) > MAX_MARKER_IMAGE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File exceeds max size of {MAX_MARKER_IMAGE_BYTES // (1024 * 1024)}MB: {upload.filename}",
            )

        extension = _derive_extension_from_content(content, upload.filename)
        if extension not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported marker image format for file: {upload.filename}")

        marker_id = _next_marker_id()
        while db.query(Marker).filter(Marker.marker_id == marker_id).first():
            marker_id = _next_marker_id()

        image_filename = f"{marker_id}{extension}"
        image_path = MARKER_IMAGE_DIR / image_filename
        image_path.write_bytes(content)

        marker = Marker(
            marker_id=marker_id,
            label=upload.filename or None,
            description=f"image:{image_filename}",
            is_active=True,
            created_by_id=current_user.id,
        )
        db.add(marker)
        created_markers.append(marker)

    db.commit()
    for marker in created_markers:
        db.refresh(marker)

    return [_serialize_marker(marker) for marker in created_markers]


@router.get("/{marker_id}", response_model=MarkerResponse)
def get_marker(
    marker_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    marker = db.query(Marker).filter(Marker.marker_id == marker_id).first()
    if not marker:
        raise HTTPException(status_code=404, detail="Marker not found")
    return _serialize_marker(marker)


@router.get("/{marker_id}/image")
def get_marker_image(
    marker_id: str,
    db: Session = Depends(get_db),
):
    marker = db.query(Marker).filter(Marker.marker_id == marker_id).first()
    if not marker:
        raise HTTPException(status_code=404, detail="Marker not found")

    image_filename = _image_filename_from_marker(marker)
    if not image_filename:
        raise HTTPException(status_code=404, detail="Marker has no uploaded image")

    image_path = MARKER_IMAGE_DIR / image_filename
    if not image_path.exists() or not image_path.is_file():
        raise HTTPException(status_code=404, detail="Marker image file is missing")

    return FileResponse(image_path)


@router.patch("/{marker_id}", response_model=MarkerResponse)
def update_marker(
    marker_id: str,
    payload: MarkerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    marker = db.query(Marker).filter(Marker.marker_id == marker_id).first()
    if not marker:
        raise HTTPException(status_code=404, detail="Marker not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(marker, field, value)

    db.commit()
    db.refresh(marker)
    return _serialize_marker(marker)


@router.get("/{marker_id}/faults", response_model=List[FaultResponse])
def list_faults_for_marker(
    marker_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    marker = db.query(Marker).filter(Marker.marker_id == marker_id).first()
    if not marker:
        raise HTTPException(status_code=404, detail="Marker not found")

    faults = (
        db.query(Fault)
        .filter(Fault.ar_marker_id == marker_id)
        .order_by(Fault.created_at.desc())
        .all()
    )
    return [_serialize_fault_with_distance(fault, marker) for fault in faults]


@router.get("/{marker_id}/nearest-fault")
def nearest_fault_for_marker(
    marker_id: str,
    max_distance_m: Optional[float] = Query(None, gt=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Optional utility endpoint: find nearest fault linked to the marker by fault coordinates."""
    marker = db.query(Marker).filter(Marker.marker_id == marker_id).first()
    if not marker:
        raise HTTPException(status_code=404, detail="Marker not found")

    if marker.latitude is None or marker.longitude is None:
        raise HTTPException(status_code=400, detail="Marker has no saved coordinates")

    faults = db.query(Fault).filter(Fault.ar_marker_id == marker_id).all()
    with_distance = []
    for fault in faults:
        if fault.latitude is None or fault.longitude is None:
            continue
        distance = _distance_meters(marker.latitude, marker.longitude, fault.latitude, fault.longitude)
        with_distance.append((distance, fault))

    if not with_distance:
        raise HTTPException(status_code=404, detail="No geolocated faults found for this marker")

    with_distance.sort(key=lambda item: item[0])
    distance, nearest = with_distance[0]

    if max_distance_m is not None and distance > max_distance_m:
        raise HTTPException(status_code=404, detail="No fault found within requested distance")

    payload = FaultResponse.model_validate(nearest).model_dump()
    payload["distance_from_marker_m"] = round(distance, 2)
    return payload
