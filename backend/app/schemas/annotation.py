from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime
from app.models.annotation import AnnotationType


class AnnotationCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    fault_id: Optional[int] = None
    annotation_type: AnnotationType = AnnotationType.note
    title: Optional[str] = None
    content: Optional[str] = None
    ar_position: Optional[Any] = None   # JSON: {"x": 0.1, "y": 0.5, "z": -0.3}
    ar_marker_id: Optional[str] = None


class AnnotationUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: Optional[str] = None
    content: Optional[str] = None
    ar_position: Optional[Any] = None


class AnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fault_id: Optional[int]
    annotation_type: AnnotationType
    title: Optional[str]
    content: Optional[str]
    ar_position: Optional[Any]
    ar_marker_id: Optional[str]
    created_by_id: int
    created_at: datetime
    updated_at: Optional[datetime]

