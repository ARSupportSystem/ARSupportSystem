from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict
from app.models.fault import FaultSeverity, FaultLocation


class MarkerCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    marker_id: str = Field(min_length=1, max_length=120)
    label: Optional[str] = None
    description: Optional[str] = None
    location_detail: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: bool = True


class MarkerBulkCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    markers: List[MarkerCreate]


class MarkerUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: Optional[str] = None
    description: Optional[str] = None
    location_detail: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: Optional[bool] = None


class MarkerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    marker_id: str
    label: Optional[str]
    description: Optional[str]
    location_detail: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    is_active: bool
    created_by_id: int
    created_at: datetime
    updated_at: Optional[datetime]
    image_url: Optional[str] = None


class FaultFromMarkerCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    description: Optional[str] = None
    severity: FaultSeverity = FaultSeverity.medium
    location: FaultLocation = FaultLocation.other
    location_detail: Optional[str] = None
    fault_latitude: Optional[float] = None
    fault_longitude: Optional[float] = None
    assigned_to_id: Optional[int] = None
