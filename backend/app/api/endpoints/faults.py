"""
Fault management endpoints.

GET    /api/faults               — list faults (filterable)
POST   /api/faults               — report a new fault
GET    /api/faults/{id}          — get fault details
PUT    /api/faults/{id}          — update fault
DELETE /api/faults/{id}          — delete fault (admin only)
PATCH  /api/faults/{id}/status   — update fault status
GET    /api/faults/marker/{marker_id} — look up fault by AR marker
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from math import radians, sin, cos, sqrt, atan2

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.fault import Fault, FaultStatus, FaultSeverity, FaultLocation
from app.models.marker import Marker
from app.schemas.fault import FaultCreate, FaultUpdate, FaultStatusUpdate, FaultResponse
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/faults", tags=["faults"])


def _assert_marker_unique(db: Session, marker_id: str, exclude_fault_id: int = None) -> None:
    """Raise 400 if marker_id is already assigned to another fault."""
    fault_q = db.query(Fault).filter(Fault.ar_marker_id == marker_id)
    if exclude_fault_id:
        fault_q = fault_q.filter(Fault.id != exclude_fault_id)
    if fault_q.first():
        raise HTTPException(status_code=400, detail="Marker is already assigned to another fault.")


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in meters between two GPS coordinates."""
    earth_radius_m = 6371000
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)

    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    )
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earth_radius_m * c


def _serialize_fault(fault: Fault, db: Session) -> dict:
    payload = FaultResponse.model_validate(fault).model_dump()

    payload["distance_from_marker_m"] = None
    if fault.ar_marker_id and fault.latitude is not None and fault.longitude is not None:
        marker = db.query(Marker).filter(Marker.marker_id == fault.ar_marker_id).first()
        if marker and marker.latitude is not None and marker.longitude is not None:
            payload["distance_from_marker_m"] = round(
                _distance_meters(marker.latitude, marker.longitude, fault.latitude, fault.longitude),
                2,
            )

    return payload


@router.get("", response_model=List[FaultResponse])
def list_faults(
    status: Optional[FaultStatus] = Query(None),
    severity: Optional[FaultSeverity] = Query(None),
    location: Optional[FaultLocation] = Query(None),
    assigned_to_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Fault)
    if status:
        q = q.filter(Fault.status == status)
    if severity:
        q = q.filter(Fault.severity == severity)
    if location:
        q = q.filter(Fault.location == location)
    if assigned_to_id:
        q = q.filter(Fault.assigned_to_id == assigned_to_id)
    faults = q.order_by(Fault.created_at.desc()).all()
    return [_serialize_fault(fault, db) for fault in faults]


@router.post("", response_model=FaultResponse, status_code=status.HTTP_201_CREATED)
def create_fault(
    payload: FaultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.ar_marker_id:
        marker = db.query(Marker).filter(Marker.marker_id == payload.ar_marker_id).first()
        if not marker:
            raise HTTPException(status_code=400, detail="Marker is not registered. Ask admin to create it first.")
        if not marker.is_active:
            raise HTTPException(status_code=400, detail="Marker is inactive and cannot be used for fault reports.")
        _assert_marker_unique(db, payload.ar_marker_id)

        if not payload.location_detail and marker.location_detail:
            payload.location_detail = marker.location_detail

    fault = Fault(**payload.model_dump(), reported_by_id=current_user.id)
    db.add(fault)
    db.commit()
    db.refresh(fault)
    return _serialize_fault(fault, db)


@router.get("/marker/{marker_id}", response_model=FaultResponse)
def get_fault_by_marker(
    marker_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Look up fault data by the AR marker ID scanned in the field."""
    fault = db.query(Fault).filter(Fault.ar_marker_id == marker_id).first()
    if not fault:
        raise HTTPException(status_code=404, detail="No fault found for this marker")
    return _serialize_fault(fault, db)


@router.get("/{fault_id}", response_model=FaultResponse)
def get_fault(
    fault_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    fault = db.query(Fault).filter(Fault.id == fault_id).first()
    if not fault:
        raise HTTPException(status_code=404, detail="Fault not found")
    return _serialize_fault(fault, db)


@router.put("/{fault_id}", response_model=FaultResponse)
def update_fault(
    fault_id: int,
    payload: FaultUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fault = db.query(Fault).filter(Fault.id == fault_id).first()
    if not fault:
        raise HTTPException(status_code=404, detail="Fault not found")

    # Technicians can only edit their own reported faults
    if current_user.role == UserRole.technician and fault.reported_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if payload.ar_marker_id:
        marker = db.query(Marker).filter(Marker.marker_id == payload.ar_marker_id).first()
        if not marker:
            raise HTTPException(status_code=400, detail="Marker is not registered. Ask admin to create it first.")
        if not marker.is_active:
            raise HTTPException(status_code=400, detail="Marker is inactive and cannot be used for fault reports.")
        _assert_marker_unique(db, payload.ar_marker_id, exclude_fault_id=fault_id)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(fault, field, value)
    db.commit()
    db.refresh(fault)
    return _serialize_fault(fault, db)


@router.patch("/{fault_id}/status", response_model=FaultResponse)
def update_fault_status(
    fault_id: int,
    payload: FaultStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    fault = db.query(Fault).filter(Fault.id == fault_id).first()
    if not fault:
        raise HTTPException(status_code=404, detail="Fault not found")

    fault.status = payload.status
    if payload.status == FaultStatus.resolved:
        fault.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(fault)
    return _serialize_fault(fault, db)


@router.delete("/{fault_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fault(
    fault_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    fault = db.query(Fault).filter(Fault.id == fault_id).first()
    if not fault:
        raise HTTPException(status_code=404, detail="Fault not found")
    db.delete(fault)
    db.commit()
