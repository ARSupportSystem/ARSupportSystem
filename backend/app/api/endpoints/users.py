"""User administration endpoints with strict RBAC and security audit logging."""

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_optional, require_role
from app.core.database import get_db
from app.core.security import get_password_strength_feedback, hash_password
from app.models.audit_log import AuditLog
from app.models.auth_token import AuthToken
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.system_config import get_or_create_singleton_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


def _audit(
    db: Session,
    action: str,
    ip: str | None,
    user_id: int | None = None,
    details: dict | None = None,
) -> None:
    """Write immutable user-management security events to the audit log."""
    try:
        db.add(
            AuditLog(
                user_id=user_id,
                action=action,
                resource_type="user",
                details=json.dumps(details) if details else None,
                ip_address=ip,
            )
        )
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to write user audit event: %s", action, exc_info=exc)


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> User:
    """Create a user account after enforcing strong password policy and uniqueness checks."""
    ip = request.client.host if request and request.client else None
    password_feedback = get_password_strength_feedback(payload.password)
    if not bool(password_feedback["valid"]):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=password_feedback)

    singleton_config = get_or_create_singleton_config(db)
    total_users = db.query(User).count()
    is_bootstrap = False

    if total_users == 0:
        if singleton_config.bootstrap_complete:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bootstrap complete. Admin authentication is required to create users.",
            )
        role_to_set = UserRole.admin
        is_bootstrap = True
    else:
        if not current_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        if current_user.role != UserRole.admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires one of: ['admin']")
        role_to_set = payload.role

    try:
        existing_user = db.query(User).filter(User.email == payload.email).first()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        user = User(
            email=str(payload.email).strip().lower(),
            full_name=payload.full_name.strip(),
            hashed_password=hash_password(payload.password),
            role=role_to_set,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to create user", exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create user")

    if is_bootstrap:
        try:
            singleton_config.bootstrap_complete = True
            db.commit()
            _audit(
                db,
                "BOOTSTRAP_COMPLETED",
                ip=ip,
                user_id=user.id,
                details={"bootstrap_user_id": user.id, "bootstrap_user_email": user.email},
            )
        except SQLAlchemyError as exc:
            db.rollback()
            logger.exception("Failed to mark bootstrap completion", exc_info=exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="User created, but failed to finalize bootstrap state",
            )

    _audit(
        db,
        "USER_CREATED",
        ip=ip,
        user_id=current_user.id if current_user else None,
        details={"created_user_id": user.id, "created_user_role": user.role.value},
    )
    return user


@router.get("/", response_model=dict)
def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    role: UserRole | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.admin, UserRole.supervisor)),
) -> dict[str, object]:
    """Return paginated users with optional role filtering for privileged operators."""
    try:
        query = db.query(User)
        if role is not None:
            query = query.filter(User.role == role)

        total = query.count()
        items = (
            query.order_by(User.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.exception("Failed to list users", exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list users")

    return {
        "items": [UserResponse.model_validate(item).model_dump() for item in items],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.admin, UserRole.supervisor)),
) -> User:
    """Return one user by identifier for admin and supervisor roles."""
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except SQLAlchemyError as exc:
        logger.exception("Failed to fetch user %s", user_id, exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch user")

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
) -> User:
    """Change a target user's role while preventing admin self-role changes."""
    if payload.role is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New role is required")

    ip = request.client.host if request.client else None
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except SQLAlchemyError as exc:
        logger.exception("Failed to read user %s for role update", user_id, exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update role")

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if current_user.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins cannot change their own role")

    old_role = user.role
    if old_role == payload.role:
        return user

    try:
        user.role = payload.role
        user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to update role for user %s", user_id, exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update role")

    _audit(
        db,
        "ROLE_CHANGE",
        ip=ip,
        user_id=current_user.id,
        details={
            "target_user_id": user.id,
            "old_role": old_role.value,
            "new_role": user.role.value,
        },
    )
    return user


@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
) -> dict[str, str]:
    """Soft-delete a user and revoke all active tokens assigned to that account."""
    ip = request.client.host if request.client else None
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except SQLAlchemyError as exc:
        logger.exception("Failed to read user %s for deactivation", user_id, exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deactivate user")

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    try:
        user.is_active = False
        user.updated_at = datetime.utcnow()
        db.query(AuthToken).filter(
            AuthToken.user_id == user.id,
            AuthToken.is_revoked.is_(False),
            AuthToken.expires_at > datetime.utcnow(),
        ).update({AuthToken.is_revoked: True}, synchronize_session=False)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to deactivate user %s", user_id, exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deactivate user")

    _audit(
        db,
        "USER_DEACTIVATED",
        ip=ip,
        user_id=current_user.id,
        details={"target_user_id": user.id},
    )
    return {"message": "User deactivated"}
