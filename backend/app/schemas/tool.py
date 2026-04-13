from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.tool import ToolCategory, ToolSessionStatus


class ToolCreate(BaseModel):
    name: str
    category: ToolCategory = ToolCategory.other
    description: Optional[str] = None
    serial_number: Optional[str] = None


class ToolUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[ToolCategory] = None
    description: Optional[str] = None
    is_available: Optional[bool] = None


class ToolResponse(BaseModel):
    id: int
    name: str
    category: ToolCategory
    description: Optional[str]
    serial_number: Optional[str]
    is_available: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Tool Session schemas ---

class SessionItemCreate(BaseModel):
    tool_id: int
    expected_count: int = 1


class SessionItemVerify(BaseModel):
    tool_id: int
    actual_count: int


class SessionItemResponse(BaseModel):
    id: int
    tool_id: int
    expected_count: int
    actual_count: Optional[int]
    is_verified: bool

    class Config:
        from_attributes = True


class ToolSessionCreate(BaseModel):
    session_name: str
    fault_id: Optional[int] = None
    notes: Optional[str] = None
    items: List[SessionItemCreate]


class ToolSessionComplete(BaseModel):
    verified_items: List[SessionItemVerify]
    notes: Optional[str] = None


class ToolSessionResponse(BaseModel):
    id: int
    session_name: str
    technician_id: int
    fault_id: Optional[int]
    status: ToolSessionStatus
    notes: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]
    items: List[SessionItemResponse]

    class Config:
        from_attributes = True
