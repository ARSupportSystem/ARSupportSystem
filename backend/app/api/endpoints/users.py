"""
User management endpoints.

GET    /api/users        — list users (admin/supervisor)
POST   /api/users        — create user (admin only)
GET    /api/users/{id}   — get user
PUT    /api/users/{id}   — update user (admin or self)
DELETE /api/users/{id}   — delete/deactivate user (admin only)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.api.deps import (
    get_current_user,
    get_current_user_optional,
    require_admin,
    require_supervisor_or_admin,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_supervisor_or_admin),
):
    return db.query(User).all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    total_users = db.query(User).count()

    # Bootstrap rule: allow creating the first account without auth.
    # The first account is always admin, regardless of requested role.
    if total_users == 0:
        role_to_set = UserRole.admin
    else:
        if not current_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        if current_user.role != UserRole.admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires one of: ['admin']")
        role_to_set = payload.role

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=role_to_set,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Users can view their own profile; supervisors/admins can view anyone
    if current_user.id != user_id and current_user.role not in (UserRole.admin, UserRole.supervisor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Only admin can change roles; users can update their own name
    if current_user.id != user_id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if payload.role and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can change roles")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False   # Soft delete — preserve audit trail
    db.commit()
