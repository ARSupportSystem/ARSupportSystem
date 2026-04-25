from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class AuthToken(Base):
    """Tracks issued JWTs so token validity can be enforced server-side."""
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    jti = Column(String, unique=True, nullable=False, index=True)
    token_type = Column(String, nullable=False, default="access")
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    is_revoked = Column(Boolean, nullable=False, default=False)

    user = relationship("User", back_populates="auth_tokens")
