from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class ToolCategory(str, enum.Enum):
    hand_tool = "hand_tool"
    power_tool = "power_tool"
    measuring = "measuring"
    safety = "safety"
    diagnostic = "diagnostic"
    other = "other"


class ToolSessionStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    incomplete = "incomplete"   # Tools missing at end of session


class Tool(Base):
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(Enum(ToolCategory), default=ToolCategory.other, nullable=False)
    description = Column(Text)
    serial_number = Column(String, unique=True, index=True)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    session_items = relationship("ToolSessionItem", back_populates="tool")


class ToolSession(Base):
    """Represents one AR tool-check session (pre/post maintenance)."""
    __tablename__ = "tool_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_name = Column(String, nullable=False)
    technician_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    fault_id = Column(Integer, ForeignKey("faults.id"), nullable=True)  # Optional link to a fault
    status = Column(Enum(ToolSessionStatus), default=ToolSessionStatus.active, nullable=False)
    notes = Column(Text)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    technician = relationship("User", back_populates="tool_sessions")
    items = relationship("ToolSessionItem", back_populates="session", cascade="all, delete-orphan")


class ToolSessionItem(Base):
    """Tracks each tool within a session — expected vs. actual count."""
    __tablename__ = "tool_session_items"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("tool_sessions.id"), nullable=False)
    tool_id = Column(Integer, ForeignKey("tools.id"), nullable=False)
    expected_count = Column(Integer, default=1)
    actual_count = Column(Integer, nullable=True)   # Filled in when session completes
    is_verified = Column(Boolean, default=False)

    # Relationships
    session = relationship("ToolSession", back_populates="items")
    tool = relationship("Tool", back_populates="session_items")
