from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.user import UserRole


class UserCreate(BaseModel):
    """Schema for admin-driven user account creation with strong password constraints."""

    model_config = ConfigDict(from_attributes=True)

    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=128)
    role: UserRole = UserRole.technician

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, value: str) -> str:
        """Trim and validate full name input to reduce malformed user records."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("full_name cannot be empty")
        return cleaned


class UserUpdate(BaseModel):
    """Schema for role-only updates managed by administrators."""

    model_config = ConfigDict(from_attributes=True)

    role: Optional[UserRole] = None


class UserResponse(BaseModel):
    """Safe user response shape that excludes sensitive credential fields."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
