"""
Authentication endpoints — JWT via OAuth2PasswordBearer.

POST /api/auth/token   — OAuth2 form login (used by Swagger UI "Authorize" button)
POST /api/auth/login   — JSON login (used by the React frontend)
GET  /api/auth/me      — current user profile
POST /api/auth/refresh — re-issue a fresh token
"""
import json
import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import delete
from uuid import uuid4

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    decode_access_token,
    revoke_token,
    verify_password,
)
from app.api.deps import get_current_user, oauth2_scheme
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.auth_token import AuthToken
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserResponse

logger = logging.getLogger(__name__)

_failed_logins: dict[str, deque[datetime]] = defaultdict(deque)
_bruteforce_audit_window: dict[str, datetime] = {}

router = APIRouter(prefix="/auth", tags=["auth"])


def _log(
    db: Session,
    action: str,
    user_id: int | None = None,
    details: dict | None = None,
    ip: str | None = None,
) -> None:
    """Write a security-relevant authentication event to the audit log."""
    try:
        db.add(
            AuditLog(
                user_id=user_id,
                action=action,
                resource_type="auth",
                details=json.dumps(details) if details else None,
                ip_address=ip,
            )
        )
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to write auth audit event: %s", action, exc_info=exc)


def _record_failed_login_attempt(ip: str | None, db: Session) -> None:
    """Track failed logins per IP and emit brute-force audit events when thresholds are reached."""
    if not ip:
        return

    now = datetime.utcnow()
    window_start = now - timedelta(minutes=settings.FAILED_LOGIN_WINDOW_MINUTES)
    timestamps = _failed_logins[ip]

    while timestamps and timestamps[0] < window_start:
        timestamps.popleft()
    timestamps.append(now)

    if len(timestamps) >= settings.MAX_FAILED_LOGINS:
        last_audit = _bruteforce_audit_window.get(ip)
        if not last_audit or last_audit < window_start:
            _log(
                db,
                "BRUTE_FORCE_SUSPECTED",
                details={
                    "ip": ip,
                    "failed_attempts": len(timestamps),
                    "window_minutes": settings.FAILED_LOGIN_WINDOW_MINUTES,
                },
                ip=ip,
            )
            _bruteforce_audit_window[ip] = now


def _clear_failed_login_attempts(ip: str | None) -> None:
    """Reset failed login tracking for an IP after successful authentication."""
    if ip and ip in _failed_logins:
        _failed_logins.pop(ip, None)
        _bruteforce_audit_window.pop(ip, None)


def _authenticate(email: str, password: str, db: Session, ip: str) -> User:
    """Shared credential check used by both login endpoints."""
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        _record_failed_login_attempt(ip, db)
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
    _clear_failed_login_attempts(ip)
    return user


def _build_token(user: User, db: Session) -> TokenResponse:
    """Create and persist an access token with JTI tracking for revocation control."""
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
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to persist issued auth token", exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to issue token")

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
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def token_form_login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
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
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def json_login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Login with JSON body — preferred for the React frontend."""
    ip = request.client.host if request.client else None
    user = _authenticate(payload.email, payload.password, db, ip)
    _log(db, "LOGIN_SUCCESS", user_id=user.id, ip=ip)
    return _build_token(user, db)


# ── Protected endpoints ─────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    """Returns the profile of the currently authenticated user."""
    return current_user


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Issues a fresh JWT for the currently authenticated user."""
    ip = request.client.host if request.client else None
    _log(db, "TOKEN_REFRESH", user_id=current_user.id, ip=ip)
    return _build_token(current_user, db)


@router.post("/logout")
def logout(
    request: Request,
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Revoke the current JWT, prune expired tokens, and log logout for audit traceability."""
    payload = decode_access_token(token)
    if not payload or not payload.get("jti"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    ip = request.client.host if request.client else None
    jti = str(payload["jti"])
    try:
        revoke_token(jti, db)
        db.execute(delete(AuthToken).where(AuthToken.expires_at < datetime.utcnow()))
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to revoke token on logout", exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to logout")

    _log(db, "LOGOUT", user_id=current_user.id, details={"jti": jti}, ip=ip)
    return {"message": "Successfully logged out"}
