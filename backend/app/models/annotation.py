from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class AnnotationType(str, enum.Enum):
    fault_marker = "fault_marker"   # Marks location of a fault in AR
    note = "note"                   # Free-text annotation
    measurement = "measurement"     # Dimensional measurement overlay
    hazard = "hazard"               # Safety hazard marker
    repair_guide = "repair_guide"   # Step-by-step repair overlay


class ARAnnotation(Base):
    """AR overlay anchored to a physical location or fault marker."""
    __tablename__ = "ar_annotations"

    id = Column(Integer, primary_key=True, index=True)
    fault_id = Column(Integer, ForeignKey("faults.id"), nullable=True)
    annotation_type = Column(Enum(AnnotationType), default=AnnotationType.note, nullable=False)
    title = Column(String)
    content = Column(Text)

    # AR positional data — stored as JSON {x, y, z} or marker reference
    ar_position = Column(JSON, nullable=True)   # e.g. {"x": 0.1, "y": 0.5, "z": -0.3}
    ar_marker_id = Column(String, nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    fault = relationship("Fault", back_populates="annotations")
    creator = relationship("User", back_populates="annotations")
