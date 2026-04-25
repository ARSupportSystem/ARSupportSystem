from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole
from app.models.auth_token import AuthToken

# Points to the login endpoint that issues tokens.
# This enables the Swagger UI "Authorize" button on every protected route.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id: int = payload.get("sub")
    jti: str = payload.get("jti")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    if not jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing jti")

    token_record = (
        db.query(AuthToken)
        .filter(AuthToken.jti == jti, AuthToken.user_id == int(user_id))
        .first()
    )
    if not token_record or token_record.is_revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token is revoked or unknown")
    if token_record.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


def get_current_user_optional(
    token: Optional[str] = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Returns authenticated user when a bearer token is provided, else None."""
    if not token:
        return None

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id: int = payload.get("sub")
    jti: str = payload.get("jti")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    if not jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing jti")

    token_record = (
        db.query(AuthToken)
        .filter(AuthToken.jti == jti, AuthToken.user_id == int(user_id))
        .first()
    )
    if not token_record or token_record.is_revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token is revoked or unknown")
    if token_record.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


def require_roles(*roles: UserRole):
    """Factory that returns a dependency enforcing one of the given roles."""
    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {[r.value for r in roles]}",
            )
        return current_user
    return _check


require_admin = require_roles(UserRole.admin)
require_supervisor_or_admin = require_roles(UserRole.admin, UserRole.supervisor)
