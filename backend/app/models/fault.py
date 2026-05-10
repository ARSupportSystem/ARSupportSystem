from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class FaultSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class FaultStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class FaultLocation(str, enum.Enum):
    tunnel = "tunnel"
    station = "station"
    track = "track"
    vehicle = "vehicle"
    platform = "platform"
    service_corridor = "service_corridor"
    plant_room = "plant_room"
    other = "other"


class Fault(Base):
    __tablename__ = "faults"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    severity = Column(Enum(FaultSeverity), default=FaultSeverity.medium, nullable=False)
    status = Column(Enum(FaultStatus), default=FaultStatus.open, nullable=False)
    location = Column(Enum(FaultLocation), default=FaultLocation.other, nullable=False)
    location_detail = Column(String)         # e.g. "Platform 3, Bay B"
    ar_marker_id = Column(String, index=True) # ID of the physical AR marker

    reported_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    reporter = relationship("User", back_populates="reported_faults", foreign_keys=[reported_by_id])
    assignee = relationship("User", back_populates="assigned_faults", foreign_keys=[assigned_to_id])
    annotations = relationship("ARAnnotation", back_populates="fault", cascade="all, delete-orphan")
