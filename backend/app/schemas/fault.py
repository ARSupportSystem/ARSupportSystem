from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.fault import FaultSeverity, FaultStatus, FaultLocation


class FaultCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: FaultSeverity = FaultSeverity.medium
    location: FaultLocation = FaultLocation.other
    location_detail: Optional[str] = None
    ar_marker_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    assigned_to_id: Optional[int] = None


class FaultUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[FaultSeverity] = None
    location: Optional[FaultLocation] = None
    location_detail: Optional[str] = None
    ar_marker_id: Optional[str] = None
    assigned_to_id: Optional[int] = None


class FaultStatusUpdate(BaseModel):
    status: FaultStatus


class FaultResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    severity: FaultSeverity
    status: FaultStatus
    location: FaultLocation
    location_detail: Optional[str]
    ar_marker_id: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    reported_by_id: int
    assigned_to_id: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime]
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True
