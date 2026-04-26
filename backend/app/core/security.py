import re
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.models.auth_token import AuthToken
from sqlalchemy.orm import Session

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt for secure storage."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash in a timing-safe manner."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create and sign a JWT access token with expiry metadata."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode a JWT access token and return payload when valid, otherwise None."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def verify_token_not_revoked(jti: str, db: Session) -> bool:
    """Validate that a JWT identified by JTI exists, is not revoked, and is unexpired."""
    token_record = db.query(AuthToken).filter(AuthToken.jti == jti).first()
    if not token_record:
        return False
    if token_record.is_revoked:
        return False
    return token_record.expires_at > datetime.utcnow()


def revoke_token(jti: str, db: Session) -> None:
    """Mark a stored JWT as revoked so it can no longer be used for authentication."""
    token_record = db.query(AuthToken).filter(AuthToken.jti == jti).first()
    if token_record:
        token_record.is_revoked = True
        db.commit()


def get_password_strength_feedback(password: str) -> dict[str, object]:
    """Evaluate password strength requirements and return validation feedback."""
    errors: list[str] = []
    if len(password) < 12:
        errors.append("Password must be at least 12 characters long")
    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        errors.append("Password must contain at least one digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        errors.append("Password must contain at least one special character")

    return {"valid": len(errors) == 0, "errors": errors}
