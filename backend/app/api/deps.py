import json
import logging
from typing import Callable, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token, verify_token_not_revoked
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# Points to the login endpoint that issues tokens.
# This enables the Swagger UI "Authorize" button on every protected route.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def _log_unauthorised_attempt(
    db: Session,
    request: Request,
    details: dict[str, str],
) -> None:
    """Write an unauthorized access attempt to the immutable audit log."""
    ip_address = request.client.host if request.client else None
    try:
        db.add(
            AuditLog(
                user_id=None,
                action="UNAUTHORISED_ACCESS_ATTEMPT",
                resource_type="auth",
                details=json.dumps(details),
                ip_address=ip_address,
            )
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to write UNAUTHORISED_ACCESS_ATTEMPT audit log", exc_info=exc)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    request: Request = None,
) -> User:
    """Resolve and validate the authenticated user with server-side token revocation checks."""
    payload = decode_access_token(token)
    if not payload:
        if request is not None:
            _log_unauthorised_attempt(db, request, {"reason": "invalid_or_expired_token"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    jti = payload.get("jti")
    if user_id is None:
        if request is not None:
            _log_unauthorised_attempt(db, request, {"reason": "missing_sub_claim"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    if not jti:
        if request is not None:
            _log_unauthorised_attempt(db, request, {"reason": "missing_jti_claim"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing jti")

    if not verify_token_not_revoked(jti, db):
        if request is not None:
            _log_unauthorised_attempt(db, request, {"reason": "token_revoked_or_unknown", "jti": str(jti)})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token is revoked, expired, or unknown")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        if request is not None:
            _log_unauthorised_attempt(db, request, {"reason": "user_not_found_or_inactive", "sub": str(user_id)})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


def get_current_user_optional(
    token: Optional[str] = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Optional[User]:
    """Return an authenticated user when token exists, otherwise return None."""
    if not token:
        return None

    return get_current_user(token=token, db=db, request=request)


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Convenience wrapper returning an already-validated active user."""
    return current_user


def require_role(*roles: UserRole) -> Callable[..., User]:
    """Build a dependency that enforces least-privilege role requirements."""

    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient role. Required one of: {[role.value for role in roles]}",
            )
        return current_user
 
    return _check


require_admin = require_role(UserRole.admin)
require_supervisor_or_admin = require_role(UserRole.admin, UserRole.supervisor)
