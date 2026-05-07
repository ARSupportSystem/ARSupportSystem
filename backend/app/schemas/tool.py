from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from app.models.tool import ToolCategory, ToolSessionStatus


class ToolCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    owner_id: Optional[int] = None
    marker_id: Optional[str] = None
    marker_image: Optional[str] = None
    category: ToolCategory = ToolCategory.other
    description: Optional[str] = None
    serial_number: Optional[str] = None


class ToolUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: Optional[str] = None
    owner_id: Optional[int] = None
    marker_id: Optional[str] = None
    marker_image: Optional[str] = None
    category: Optional[ToolCategory] = None
    description: Optional[str] = None
    is_available: Optional[bool] = None


class ToolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    owner_id: Optional[int]
    marker_id: Optional[str]
    marker_image: Optional[str]
    category: ToolCategory
    description: Optional[str]
    serial_number: Optional[str]
    is_available: bool
    created_at: datetime


class ToolActionCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tool_id: int
    action: str
    timestamp: Optional[str] = None


class ToolActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tool_id: int
    user_id: int
    action: str
    timestamp: datetime



# --- Tool Session schemas ---

class SessionItemCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tool_id: int
    expected_count: int = 1


class SessionItemVerify(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tool_id: int
    actual_count: int


class SessionItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tool_id: int
    expected_count: int
    actual_count: Optional[int]
    is_verified: bool



class ToolSessionCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_name: str
    fault_id: Optional[int] = None
    notes: Optional[str] = None
    items: List[SessionItemCreate]


class ToolSessionComplete(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    verified_items: List[SessionItemVerify]
    notes: Optional[str] = None


class ToolSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_name: str
    technician_id: int
    fault_id: Optional[int]
    status: ToolSessionStatus
    notes: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]
    items: List[SessionItemResponse]

