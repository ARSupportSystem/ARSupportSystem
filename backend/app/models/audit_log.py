from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AuditLog(Base):
    """Immutable record of every significant action in the system."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Nullable for unauthenticated events
    action = Column(String, nullable=False)          # e.g. "CREATE_FAULT", "LOGIN_FAILED"
    resource_type = Column(String, nullable=True)    # e.g. "fault", "tool", "user"
    resource_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)            # JSON string with extra context
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="audit_logs")
