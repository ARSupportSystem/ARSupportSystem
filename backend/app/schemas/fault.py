from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from app.models.fault import FaultSeverity, FaultStatus, FaultLocation


class FaultCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    description: Optional[str] = None
    severity: FaultSeverity = FaultSeverity.medium
    location: FaultLocation = FaultLocation.other
    location_detail: Optional[str] = None
    ar_marker_id: Optional[str] = None
    assigned_to_id: Optional[int] = None


class FaultUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[FaultSeverity] = None
    location: Optional[FaultLocation] = None
    location_detail: Optional[str] = None
    ar_marker_id: Optional[str] = None
    assigned_to_id: Optional[int] = None


class FaultStatusUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: FaultStatus


class FaultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    severity: FaultSeverity
    status: FaultStatus
    location: FaultLocation
    location_detail: Optional[str]
    ar_marker_id: Optional[str]
    reported_by_id: int
    assigned_to_id: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime]
    resolved_at: Optional[datetime]
