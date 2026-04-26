from sqlalchemy import Boolean, Column, DateTime, Integer
from sqlalchemy.sql import func

from app.core.database import Base


class SingletonConfig(Base):
    """Singleton system-wide configuration persisted in the database."""

    __tablename__ = "singleton_config"

    id = Column(Integer, primary_key=True, default=1)
    bootstrap_complete = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
