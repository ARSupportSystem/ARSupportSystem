from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    supervisor = "supervisor"
    technician = "technician"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.technician, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    reported_faults = relationship("Fault", back_populates="reporter", foreign_keys="Fault.reported_by_id")
    assigned_faults = relationship("Fault", back_populates="assignee", foreign_keys="Fault.assigned_to_id")
    tool_sessions = relationship("ToolSession", back_populates="technician")
    annotations = relationship("ARAnnotation", back_populates="creator")
    audit_logs = relationship("AuditLog", back_populates="user")
