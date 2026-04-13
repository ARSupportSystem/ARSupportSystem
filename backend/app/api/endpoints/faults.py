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

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.fault import Fault, FaultStatus, FaultSeverity, FaultLocation
from app.schemas.fault import FaultCreate, FaultUpdate, FaultStatusUpdate, FaultResponse
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/faults", tags=["faults"])


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
    return q.order_by(Fault.created_at.desc()).all()


@router.post("", response_model=FaultResponse, status_code=status.HTTP_201_CREATED)
def create_fault(
    payload: FaultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fault = Fault(**payload.model_dump(), reported_by_id=current_user.id)
    db.add(fault)
    db.commit()
    db.refresh(fault)
    return fault


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
    return fault


@router.get("/{fault_id}", response_model=FaultResponse)
def get_fault(
    fault_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    fault = db.query(Fault).filter(Fault.id == fault_id).first()
    if not fault:
        raise HTTPException(status_code=404, detail="Fault not found")
    return fault


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

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(fault, field, value)
    db.commit()
    db.refresh(fault)
    return fault


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
    return fault


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
