"""
Authentication endpoints — JWT via OAuth2PasswordBearer.

POST /api/auth/token   — OAuth2 form login (used by Swagger UI "Authorize" button)
POST /api/auth/login   — JSON login (used by the React frontend)
GET  /api/auth/me      — current user profile
POST /api/auth/refresh — re-issue a fresh token
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from uuid import uuid4
import json

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.auth_token import AuthToken
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _log(db: Session, action: str, user_id=None, details=None, ip=None):
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        resource_type="auth",
        details=json.dumps(details) if details else None,
        ip_address=ip,
    ))
    db.commit()


def _authenticate(email: str, password: str, db: Session, ip: str) -> User:
    """Shared credential check used by both login endpoints."""
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        _log(db, "LOGIN_FAILED", details={"email": email}, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )
    return user


def _build_token(user: User, db: Session) -> TokenResponse:
    jti = str(uuid4())
    expires_at = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "jti": jti,
    })

    db.add(AuthToken(
        user_id=user.id,
        jti=jti,
        token_type="access",
        expires_at=expires_at,
        is_revoked=False,
    ))
    db.commit()

    return TokenResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── OAuth2 form endpoint — required for Swagger "Authorize" button ──────────

@router.post(
    "/token",
    response_model=TokenResponse,
    summary="OAuth2 token (Swagger login)",
    include_in_schema=True,
)
def token_form_login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Standard OAuth2 password flow.
    `username` field should contain the user's email address.
    """
    ip = request.client.host if request.client else None
    user = _authenticate(form_data.username, form_data.password, db, ip)
    _log(db, "LOGIN_SUCCESS", user_id=user.id, ip=ip)
    return _build_token(user, db)


# ── JSON endpoint — used by the React frontend ──────────────────────────────

@router.post("/login", response_model=TokenResponse)
def json_login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Login with JSON body — preferred for the React frontend."""
    ip = request.client.host if request.client else None
    user = _authenticate(payload.email, payload.password, db, ip)
    _log(db, "LOGIN_SUCCESS", user_id=user.id, ip=ip)
    return _build_token(user, db)


# ── Protected endpoints ─────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns the profile of the currently authenticated user."""
    return current_user


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Issues a fresh JWT for the currently authenticated user."""
    return _build_token(current_user, db)
